import { FastifyInstance } from 'fastify';
import type { DbPool } from '@civiclens/db';

export async function readyRoutes(app: FastifyInstance, opts: { pool?: DbPool | null }) {
  app.get('/', async (_request, reply) => {
    if (opts.pool) {
      try {
        await opts.pool.query('SELECT 1');
      } catch {
        return reply.code(503).send({ status: 'unavailable', reason: 'database unreachable' });
      }
    }
    return reply.code(200).send({ status: 'ready' });
  });
}
