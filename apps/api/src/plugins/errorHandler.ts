import { FastifyError, FastifyInstance } from 'fastify';

export async function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    app.log.error({ err: error, requestId: request.id }, error.message);
    const statusCode = error.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: {
        message: statusCode >= 500 ? 'Internal Server Error' : error.message,
        statusCode,
        requestId: request.id,
      },
    });
  });
}
