import { randomUUID } from 'crypto';
import Fastify from 'fastify';
import type { DbPool } from '@civreveal/db';
import { getPool } from '@civreveal/db';
import { env } from './env.js';
import { registerRoutes } from './routes/index.js';
import { registerErrorHandler } from './plugins/errorHandler.js';

export async function buildApp(overrides?: { pool?: DbPool | null }) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    /** Generate UUID-based request IDs so every log line is traceable. */
    genReqId: () => randomUUID(),
  });

  await registerErrorHandler(app);

  const pool =
    overrides?.pool !== undefined
      ? overrides.pool
      : env.DATABASE_URL
        ? getPool(env.DATABASE_URL)
        : null;
  await registerRoutes(app, { pool });

  return app;
}
