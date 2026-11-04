import { describe, it, expect, vi } from 'vitest';
import { createStatsRepository } from './stats.js';
import type { DbPool } from '@civreveal/db';

function poolReturning(rows: unknown[]): DbPool {
  return { query: vi.fn(async () => ({ rows, rowCount: rows.length })) } as unknown as DbPool;
}

describe('createStatsRepository', () => {
  it('parses counts to numbers and the last ingest time to ISO-8601', async () => {
    const repo = createStatsRepository(
      poolReturning([
        {
          members: '539',
          bills: '1487',
          bills_tagged: '1064',
          house_votes: '676',
          senate_votes: '0',
          vote_records: '291000',
          last_ingest_at: new Date('2026-11-04T00:54:09Z'),
        },
      ]),
    );
    expect(await repo.getStats()).toEqual({
      members: 539,
      bills: 1487,
      bills_tagged: 1064,
      house_votes: 676,
      senate_votes: 0,
      vote_records: 291000,
      last_ingest_at: '2026-11-04T00:54:09.000Z',
    });
  });

  it('returns zeros and null on an empty database', async () => {
    const repo = createStatsRepository(
      poolReturning([
        { members: '0', bills: '0', bills_tagged: '0', house_votes: '0', senate_votes: '0', vote_records: '0', last_ingest_at: null },
      ]),
    );
    const stats = await repo.getStats();
    expect(stats.bills).toBe(0);
    expect(stats.last_ingest_at).toBeNull();
  });
});
