import { FastifyInstance } from 'fastify';
import type { DbPool } from '@civiclens/db';
import { healthRoutes } from './health.js';
import { readyRoutes } from './ready.js';
import { billRoutes } from './bills.js';
import { politicianRoutes } from './politicians.js';

export async function registerRoutes(app: FastifyInstance, opts: { pool: DbPool | null }) {
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(readyRoutes, { prefix: '/ready', pool: opts.pool });

  if (opts.pool) {
    await app.register(billRoutes, { prefix: '/bills', pool: opts.pool });
    await app.register(politicianRoutes, { prefix: '/politicians', pool: opts.pool });
  }
}
