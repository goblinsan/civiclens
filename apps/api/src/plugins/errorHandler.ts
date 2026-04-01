import { FastifyInstance } from 'fastify';

export async function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: {
        message: statusCode >= 500 ? 'Internal Server Error' : error.message,
        statusCode,
      },
    });
  });
}
