import { z } from 'zod';
import { POLICY_TAGS, BILL_STATUSES } from '../constants.js';

export const BillSchema = z.object({
  id: z.string(),
  congress: z.number().int().positive(),
  number: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  status: z.enum(BILL_STATUSES),
  sponsorId: z.string(),
  introducedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tags: z.array(z.enum(POLICY_TAGS)),
});

export type Bill = z.infer<typeof BillSchema>;
