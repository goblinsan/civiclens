import { z } from 'zod';
import { POLICY_TAGS } from '../constants.js';

export const QuestionnaireResponseSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  responses: z.array(
    z.object({
      tag: z.enum(POLICY_TAGS),
      stance: z.enum(['strongly-support', 'support', 'neutral', 'oppose', 'strongly-oppose']),
    }),
  ),
  submittedAt: z.string().datetime(),
  turnstileToken: z.string().optional(),
});

export type QuestionnaireResponse = z.infer<typeof QuestionnaireResponseSchema>;
