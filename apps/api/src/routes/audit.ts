import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbPool } from '@civreveal/db';
import { createAuditLogRepository } from '../repositories/index.js';
import type { AuditLogRepository } from '../repositories/index.js';

const querySchema = z.object({
  event_type:  z.string().optional(),
  source:      z.string().optional(),
  entity_type: z.string().optional(),
  since:       z.string().datetime({ offset: true }).optional(),
  limit:       z.coerce.number().int().min(1).max(100).default(50),
  page:        z.coerce.number().int().positive().default(1),
});

export async function auditRoutes(
  app: FastifyInstance,
  opts: { pool: DbPool },
) {
  const repo: AuditLogRepository = createAuditLogRepository(opts.pool);

  /**
   * GET /audit/events
   * Query interpretation-sensitive audit events.
   *
   * Query params:
   *   event_type  – filter by event type (e.g. run_start, sentiment_block)
   *   source      – filter by originating subsystem (e.g. ingest-congress, api)
   *   entity_type – filter by entity category (e.g. bills, sentiment)
   *   since       – ISO-8601 datetime; only return events on or after this time
   *   limit       – results per page (1–100, default 50)
   *   page        – page number (default 1)
   */
  app.get('/events', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { message: 'Invalid query parameters', statusCode: 400 } });
    }
    const result = await repo.queryEvents(parsed.data);
    return reply.send(result);
  });
}
