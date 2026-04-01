import { z } from 'zod';
import { VOTE_VALUES } from '../constants.js';

export const VoteSchema = z.object({
  id: z.string(),
  billId: z.string(),
  chamber: z.enum(['senate', 'house']),
  date: z.string().datetime(),
  result: z.enum(['passed', 'failed', 'tie']),
});

export type Vote = z.infer<typeof VoteSchema>;

export const VoteRecordSchema = z.object({
  id: z.string(),
  voteId: z.string(),
  politicianId: z.string(),
  value: z.enum(VOTE_VALUES),
});

export type VoteRecord = z.infer<typeof VoteRecordSchema>;
