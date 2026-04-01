import Fastify from 'fastify';
import { getPool } from '@civiclens/db';
import { env } from './env.js';
import { registerRoutes } from './routes/index.js';
import { registerErrorHandler } from './plugins/errorHandler.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  await registerErrorHandler(app);

  const pool = env.DATABASE_URL ? getPool(env.DATABASE_URL) : null;
  await registerRoutes(app, { pool });

  return app;
}
