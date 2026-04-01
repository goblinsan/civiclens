import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbPool } from '@civiclens/db';
import { createBillsRepository } from '../repositories/index.js';
import type { BillsRepository } from '../repositories/index.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  tag: z.string().optional(),
  congress: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
});

export async function billRoutes(
  app: FastifyInstance,
  opts: { pool: DbPool },
) {
  const repo: BillsRepository = createBillsRepository(opts.pool);

  // GET /bills  — list / search
  app.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { message: 'Invalid query parameters', statusCode: 400 } });
    }
    const { page, limit, status, tag, congress, q } = parsed.data;

    if (q) {
      const result = await repo.searchBills(q, { page, limit });
      return reply.send(result);
    }

    const result = await repo.listBills({
      page,
      limit,
      ...(status !== undefined && { status }),
      ...(tag !== undefined && { tag }),
      ...(congress !== undefined && { congress }),
    });
    return reply.send(result);
  });

  // GET /bills/:id  — single bill
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const bill = await repo.getBillById(id);
    if (!bill) {
      return reply.code(404).send({ error: { message: 'Bill not found', statusCode: 404 } });
    }
    return reply.send(bill);
  });

  // GET /bills/:id/votes  — roll-call votes for a bill
  app.get('/:id/votes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const votes = await repo.getBillVotes(id);
    return reply.send(votes);
  });
}
