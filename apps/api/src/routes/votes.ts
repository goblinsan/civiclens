import { FastifyInstance } from 'fastify';
import type { DbPool } from '@civiclens/db';
import { createVotesRepository } from '../repositories/index.js';
import type { VotesRepository } from '../repositories/index.js';

export async function voteRoutes(app: FastifyInstance, opts: { pool: DbPool }) {
  const repo: VotesRepository = createVotesRepository(opts.pool);

  // GET /votes/:voteId/records  — per-politician records for a roll-call vote
  app.get('/:voteId/records', async (request, reply) => {
    const { voteId } = request.params as { voteId: string };
    const vote = await repo.getVoteById(voteId);
    if (!vote) {
      return reply.code(404).send({ error: { message: 'Vote not found', statusCode: 404 } });
    }
    const records = await repo.getVoteRecordsWithPoliticians(voteId);
    return reply.send(records);
  });
}
