import { FastifyInstance } from 'fastify';

export async function readyRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    // TODO: check database connectivity when DB layer is added
    return reply.code(200).send({ status: 'ready' });
  });
}
