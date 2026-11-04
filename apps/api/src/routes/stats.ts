import { FastifyInstance } from 'fastify';
import type { DbPool } from '@civreveal/db';
import { createStatsRepository } from '../repositories/index.js';
import type { StatsRepository } from '../repositories/index.js';

export async function statsRoutes(app: FastifyInstance, opts: { pool: DbPool }) {
  const repo: StatsRepository = createStatsRepository(opts.pool);

  /** GET /stats — headline counts and data freshness for the home page. */
  app.get('/', async (_request, reply) => {
    const stats = await repo.getStats();
    // Cheap to compute but not worth hammering: let clients and CDNs cache briefly.
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send(stats);
  });
}
