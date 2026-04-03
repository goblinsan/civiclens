import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbPool } from '@civiclens/db';
import { createBillsRepository, createSentimentsRepository, createAuditLogRepository } from '../repositories/index.js';
import type { BillsRepository, SentimentsRepository, AuditLogRepository } from '../repositories/index.js';
import { checkRateLimit } from '../plugins/rateLimiter.js';
import { env } from '../env.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  tag: z.string().optional(),
  congress: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
});

const sentimentBodySchema = z.object({
  sessionId: z.string().min(1),
  sentiment: z.enum(['support', 'oppose', 'neutral']),
  /** Cloudflare Turnstile challenge token.  Required in production; optional in dev. */
  turnstileToken: z.string().optional(),
});

/**
 * Verify a Cloudflare Turnstile token against the siteverify API.
 *
 * Bypass strategy (documented):
 *   - If `TURNSTILE_SECRET_KEY` is not set AND `NODE_ENV` is `development`,
 *     verification is skipped and the function returns `true`.
 *   - In all other environments the function is fail-closed: missing or
 *     invalid tokens return `false`.
 */
async function verifyTurnstile(token: string | undefined, remoteIp?: string): Promise<boolean> {
  const secretKey = env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    // Dev-only bypass: allow submissions when no secret key is configured.
    return env.NODE_ENV === 'development';
  }

  if (!token) return false;

  const body = new URLSearchParams();
  body.append('secret', secretKey);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    // Fail closed on network errors.
    return false;
  }
}

export async function billRoutes(
  app: FastifyInstance,
  opts: { pool: DbPool },
) {
  const repo: BillsRepository = createBillsRepository(opts.pool);
  const sentimentRepo: SentimentsRepository = createSentimentsRepository(opts.pool);
  const auditRepo: AuditLogRepository = createAuditLogRepository(opts.pool);

  // GET /bills  — list / search
  app.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { message: 'Invalid query parameters', statusCode: 400 } });
    }
    const { page, limit, status, tag, congress, q } = parsed.data;

    if (q) {
      const result = await repo.searchBills(q, { page, limit });
      return reply.send(result);
    }

    const result = await repo.listBills({
      page,
      limit,
      ...(status !== undefined && { status }),
      ...(tag !== undefined && { tag }),
      ...(congress !== undefined && { congress }),
    });
    return reply.send(result);
  });

  // GET /bills/:id  — single bill
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const bill = await repo.getBillById(id);
    if (!bill) {
      return reply.code(404).send({ error: { message: 'Bill not found', statusCode: 404 } });
    }
    return reply.send(bill);
  });

  // GET /bills/:id/votes  — roll-call votes for a bill
  app.get('/:id/votes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const votes = await repo.getBillVotes(id);
    return reply.send(votes);
  });

  // GET /bills/:id/sentiments  — aggregate public-sentiment counts
  app.get('/:id/sentiments', async (request, reply) => {
    const { id: billId } = request.params as { id: string };
    const counts = await sentimentRepo.getSentimentCounts(billId);
    return reply.send(counts);
  });

  // POST /bills/:id/sentiments  — submit public sentiment
  app.post('/:id/sentiments', async (request, reply) => {
    const { id: billId } = request.params as { id: string };

    const parsed = sentimentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { message: 'Invalid request body', statusCode: 400 } });
    }
    const { sessionId, sentiment, turnstileToken } = parsed.data;

    // ── Rate limiting by IP ───────────────────────────────────────────────────
    const ip = request.ip ?? 'unknown';
    const { limited, suspicious } = checkRateLimit(`sentiment:${ip}`);

    if (suspicious) {
      app.log.warn(
        { ip, billId, sessionId },
        'Suspicious burst of sentiment submissions detected',
      );
    }

    if (limited) {
      app.log.warn({ ip, billId, sessionId }, 'Sentiment rate limit exceeded');
      void auditRepo.logEvent({
        event_type: 'sentiment_block',
        source: 'api',
        entity_type: 'sentiment',
        entity_id: billId,
        data: { reason: 'rate_limit', ip, sessionId },
      });
      return reply.code(429).send({
        error: { message: 'Too many requests. Please try again later.', statusCode: 429 },
      });
    }

    // ── Turnstile bot verification ────────────────────────────────────────────
    const turnstileValid = await verifyTurnstile(turnstileToken, ip);
    if (!turnstileValid) {
      app.log.warn({ ip, billId, sessionId }, 'Turnstile verification failed for sentiment');
      void auditRepo.logEvent({
        event_type: 'sentiment_block',
        source: 'api',
        entity_type: 'sentiment',
        entity_id: billId,
        data: { reason: 'turnstile_failed', ip, sessionId },
      });
      return reply.code(403).send({
        error: { message: 'Bot verification failed. Please try again.', statusCode: 403 },
      });
    }

    // ── Bill existence check ──────────────────────────────────────────────────
    const bill = await repo.getBillById(billId);
    if (!bill) {
      return reply.code(404).send({ error: { message: 'Bill not found', statusCode: 404 } });
    }

    // ── Persist sentiment ─────────────────────────────────────────────────────
    const result = await sentimentRepo.submitSentiment(billId, sessionId, sentiment);

    if (result.isDuplicate) {
      return reply.code(409).send({
        error: {
          message: 'You have already submitted sentiment for this bill.',
          statusCode: 409,
        },
      });
    }

    return reply.code(201).send({ id: result.submission.id, sentiment });
  });
}
