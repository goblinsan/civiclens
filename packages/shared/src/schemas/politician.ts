import { z } from 'zod';

export const PoliticianSchema = z.object({
  id: z.string(),
  bioguideId: z.string(),
  name: z.string(),
  party: z.string(),
  state: z.string(),
  chamber: z.enum(['senate', 'house']),
  district: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  website: z.string().url().optional(),
});

export type Politician = z.infer<typeof PoliticianSchema>;
