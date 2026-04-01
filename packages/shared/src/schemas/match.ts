import { z } from 'zod';

export const MatchResultSchema = z.object({
  politicianId: z.string(),
  sessionId: z.string(),
  score: z.number().min(0).max(100),
  breakdown: z.record(z.string(), z.number()),
  computedAt: z.string().datetime(),
});

export type MatchResult = z.infer<typeof MatchResultSchema>;
