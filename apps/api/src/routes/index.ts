import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { readyRoutes } from './ready.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(readyRoutes, { prefix: '/ready' });
}
