import { describe, it, expect, vi } from 'vitest';
import { createVotesRepository } from '../repositories/votes.js';
import type { DbPool } from '@civreveal/db';

function makePoolMock(overrides: Record<string, unknown[]> = {}) {
  const mock = {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      for (const [pattern, rows] of Object.entries(overrides)) {
        if (sql.includes(pattern)) {
          return { rows, rowCount: rows.length };
        }
      }
      return { rows: [], rowCount: 0 };
    }),
  };
  return mock as unknown as DbPool;
}

const fakeVote = {
  id: 'vote-uuid-1',
  bill_id: 'bill-uuid-1',
  chamber: 'house' as const,
  vote_date: new Date('2023-06-15'),
  result: 'passed' as const,
  yea_count: 220,
  nay_count: 210,
  abstain_count: 2,
  not_voting_count: 3,
  created_at: new Date(),
};

const fakeRecord = {
  id: 'vr-uuid-1',
  vote_id: 'vote-uuid-1',
  politician_id: 'pol-uuid-1',
  value: 'yea' as const,
  created_at: new Date(),
};

describe('createVotesRepository', () => {
  describe('getVoteById', () => {
    it('returns the vote when found', async () => {
      const pool = makePoolMock({ 'WHERE id': [fakeVote] });
      const repo = createVotesRepository(pool);
      const vote = await repo.getVoteById('vote-uuid-1');
      expect(vote).not.toBeNull();
      expect(vote?.result).toBe('passed');
    });

    it('returns null when not found', async () => {
      const pool = makePoolMock();
      const repo = createVotesRepository(pool);
      const vote = await repo.getVoteById('nonexistent');
      expect(vote).toBeNull();
    });
  });

  describe('getVoteRecords', () => {
    it('returns vote records for a vote', async () => {
      const pool = makePoolMock({ 'WHERE vr.vote_id': [fakeRecord] });
      const repo = createVotesRepository(pool);
      const records = await repo.getVoteRecords('vote-uuid-1');
      expect(records).toHaveLength(1);
      expect(records[0]?.value).toBe('yea');
    });
  });

  describe('getVoteWithRecords', () => {
    it('returns null when vote does not exist', async () => {
      const pool = makePoolMock();
      const repo = createVotesRepository(pool);
      const result = await repo.getVoteWithRecords('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getVotesByBillId', () => {
    it('returns empty array when no votes for bill', async () => {
      const pool = makePoolMock();
      const repo = createVotesRepository(pool);
      const votes = await repo.getVotesByBillId('bill-uuid-1');
      expect(votes).toEqual([]);
    });
  });
});
