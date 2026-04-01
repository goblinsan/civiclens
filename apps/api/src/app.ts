import Fastify from 'fastify';
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
  await registerRoutes(app);

  return app;
}
