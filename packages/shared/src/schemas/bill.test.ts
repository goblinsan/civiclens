import { describe, it, expect } from 'vitest';
import { BillSchema } from './bill';

describe('BillSchema', () => {
  it('validates a valid bill', () => {
    const result = BillSchema.safeParse({
      id: 'bill-1',
      congress: 118,
      number: 'HR1',
      title: 'Test Bill',
      status: 'introduced',
      sponsorId: 'pol-1',
      introducedAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
      tags: ['healthcare'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a bill with invalid status', () => {
    const result = BillSchema.safeParse({
      id: 'bill-1',
      congress: 118,
      number: 'HR1',
      title: 'Test Bill',
      status: 'invalid-status',
      sponsorId: 'pol-1',
      introducedAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
      tags: [],
    });
    expect(result.success).toBe(false);
  });
});
