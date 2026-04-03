import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbPool } from '@civiclens/db';
import { createAuditLogRepository } from '../repositories/index.js';
import type { AuditLogRepository } from '../repositories/index.js';

const eventBodySchema = z.object({
  event: z.string().min(1).max(100),
  properties: z.record(z.unknown()).optional(),
});

export async function analyticsRoutes(
  app: FastifyInstance,
  opts: { pool: DbPool },
) {
  const repo: AuditLogRepository = createAuditLogRepository(opts.pool);

  /**
   * POST /analytics/events
   * Record a client-side product analytics event.
   * Fire-and-forget from the browser — always returns 202.
   */
  app.post('/events', async (request, reply) => {
    const parsed = eventBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { message: 'Invalid request body', statusCode: 400 } });
    }

    const { event, properties } = parsed.data;

    void repo.logEvent({
      event_type: event,
      source: 'web-client',
      data: properties ?? {},
    }).catch((err: unknown) => {
      app.log.debug({ err }, 'analytics logEvent failed');
    });

    return reply.code(202).send();
  });
}
