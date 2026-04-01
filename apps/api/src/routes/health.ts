import { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'civiclens-api',
      version: process.env['npm_package_version'] ?? '0.0.0',
      timestamp: new Date().toISOString(),
    });
  });
}
