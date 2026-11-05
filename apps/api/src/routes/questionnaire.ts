import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbPool } from '@civreveal/db';
import { GOAL_STANCES } from '@civreveal/shared';
import { createGoalsRepository, createQuestionnaireRepository } from '../repositories/index.js';
import type { GoalsRepository, QuestionnaireRepository } from '../repositories/index.js';

const submitBodySchema = z.object({
  sessionId: z.string().min(1),
  answers: z
    .array(
      z.object({
        goal: z.string().min(1),
        stance: z.enum(GOAL_STANCES),
        importance: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
      }),
    )
    .min(1)
    .max(200),
});

const sessionQuerySchema = z.object({
  sessionId: z.string().min(1),
});

export async function questionnaireRoutes(app: FastifyInstance, opts: { pool: DbPool }) {
  const repo: QuestionnaireRepository = createQuestionnaireRepository(opts.pool);
  const goals: GoalsRepository = createGoalsRepository(opts.pool);

  // GET /questionnaire/goals — the goals to answer, grouped by area
  app.get('/goals', async (_request, reply) => {
    const areas = await goals.listGoalAreas();
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send({ areas });
  });

  // POST /questionnaire/submit — save goal answers and compute match results
  app.post('/submit', async (request, reply) => {
    const parsed = submitBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid request body', statusCode: 400 } });
    }
    const { sessionId, answers } = parsed.data;

    const profile = await repo.upsertProfile(sessionId);
    const stored = await repo.replaceGoalAnswers(
      profile.id,
      answers.map((a) => ({ goalSlug: a.goal, stance: a.stance, importance: a.importance })),
    );
    if (stored === 0) {
      return reply.code(400).send({ error: { message: 'No known goals in answers', statusCode: 400 } });
    }
    await repo.computeAndSaveMatchResults(profile.id);

    return reply.code(200).send({ sessionId, profileId: profile.id, answered: stored });
  });

  // GET /questionnaire/matches?sessionId=… — ranked match results
  app.get('/matches', async (request, reply) => {
    const parsed = sessionQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid query parameters', statusCode: 400 } });
    }
    const { sessionId } = parsed.data;

    const profile = await repo.getProfileBySessionId(sessionId);
    if (!profile) {
      return reply
        .code(404)
        .send({ error: { message: 'No questionnaire found for this session', statusCode: 404 } });
    }
    return reply.send(await repo.getMatchResultsBySessionId(sessionId));
  });

  // GET /questionnaire/matches/:politicianId/evidence?sessionId=… — the votes that counted
  app.get<{ Params: { politicianId: string } }>('/matches/:politicianId/evidence', async (request, reply) => {
    const parsed = sessionQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid query parameters', statusCode: 400 } });
    }
    const { sessionId } = parsed.data;
    const profile = await repo.getProfileBySessionId(sessionId);
    if (!profile) {
      return reply
        .code(404)
        .send({ error: { message: 'No questionnaire found for this session', statusCode: 404 } });
    }
    return reply.send(await repo.getMatchEvidence(sessionId, request.params.politicianId));
  });
}
