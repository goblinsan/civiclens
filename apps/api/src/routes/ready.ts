import { FastifyInstance } from 'fastify';

export async function readyRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    // TODO: check database connectivity when DB layer is added
    return reply.status(200).send({ status: 'ready' });
  });
}
