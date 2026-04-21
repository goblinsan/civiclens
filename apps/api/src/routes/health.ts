import { createRequire } from 'module';
import { FastifyInstance } from 'fastify';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pkg: { version?: string } = require('../../package.json');

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    return reply.code(200).send({
      status: 'ok',
      service: 'civreveal-api',
      version: pkg.version ?? '0.0.0',
      timestamp: new Date().toISOString(),
    });
  });
}
