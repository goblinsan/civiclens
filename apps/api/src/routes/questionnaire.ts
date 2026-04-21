import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbPool } from '@civreveal/db';
import { POLICY_TAGS } from '@civreveal/shared';
import { createQuestionnaireRepository } from '../repositories/index.js';
import type { QuestionnaireRepository } from '../repositories/index.js';

const stanceEnum = z.enum([
  'strongly-support',
  'support',
  'neutral',
  'oppose',
  'strongly-oppose',
]);

const submitBodySchema = z.object({
  sessionId: z.string().min(1),
  responses: z
    .array(
      z.object({
        tag: z.enum(POLICY_TAGS),
        stance: stanceEnum,
      }),
    )
    .min(1),
});

const matchesQuerySchema = z.object({
  sessionId: z.string().min(1),
});

export async function questionnaireRoutes(
  app: FastifyInstance,
  opts: { pool: DbPool },
) {
  const repo: QuestionnaireRepository = createQuestionnaireRepository(opts.pool);

  // GET /questionnaire/questions  — list all policy tags for the questionnaire
  app.get('/questions', async (_request, reply) => {
    const tags = await repo.listPolicyTags();
    return reply.send(tags);
  });

  // POST /questionnaire/submit  — save answers and compute match results
  app.post('/submit', async (request, reply) => {
    const parsed = submitBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { message: 'Invalid request body', statusCode: 400 } });
    }
    const { sessionId, responses } = parsed.data;

    const profile = await repo.upsertProfile(sessionId);
    await repo.upsertAnswers(
      profile.id,
      responses.map((r) => ({ tagSlug: r.tag, stance: r.stance })),
    );
    await repo.computeAndSaveMatchResults(profile.id);

    return reply.code(200).send({ sessionId, profileId: profile.id });
  });

  // GET /questionnaire/matches?sessionId=…  — retrieve ranked match results
  app.get('/matches', async (request, reply) => {
    const parsed = matchesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { message: 'Invalid query parameters', statusCode: 400 } });
    }
    const { sessionId } = parsed.data;

    const profile = await repo.getProfileBySessionId(sessionId);
    if (!profile) {
      return reply
        .code(404)
        .send({ error: { message: 'No questionnaire found for this session', statusCode: 404 } });
    }

    const results = await repo.getMatchResultsBySessionId(sessionId);
    return reply.send(results);
  });
}
