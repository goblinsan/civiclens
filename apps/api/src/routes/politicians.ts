import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbPool } from '@civiclens/db';
import { createPoliticiansRepository } from '../repositories/index.js';
import type { PoliticiansRepository } from '../repositories/index.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  chamber: z.enum(['senate', 'house']).optional(),
  party: z.string().optional(),
  state: z.string().optional(),
});

export async function politicianRoutes(
  app: FastifyInstance,
  opts: { pool: DbPool },
) {
  const repo: PoliticiansRepository = createPoliticiansRepository(opts.pool);

  // GET /politicians  — paginated list with optional filters
  app.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { message: 'Invalid query parameters', statusCode: 400 } });
    }
    const { page, limit, chamber, party, state } = parsed.data;
    const result = await repo.listPoliticians({
      page,
      limit,
      ...(chamber !== undefined && { chamber }),
      ...(party !== undefined && { party }),
      ...(state !== undefined && { state }),
    });
    return reply.send(result);
  });

  // GET /politicians/:id  — single politician
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const politician = await repo.getPoliticianById(id);
    if (!politician) {
      return reply
        .code(404)
        .send({ error: { message: 'Politician not found', statusCode: 404 } });
    }
    return reply.send(politician);
  });

  // GET /politicians/:id/votes  — paginated vote history
  app.get('/:id/votes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pageSchema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    });
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { message: 'Invalid query parameters', statusCode: 400 } });
    }
    const result = await repo.getPoliticianVotes(id, parsed.data);
    return reply.send(result);
  });
}
