import { describe, it, expect, vi } from 'vitest';
import { createSentimentsRepository } from '../repositories/sentiments.js';
import type { DbPool } from '@civreveal/db';

/** Minimal pool mock. */
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
    connect: vi.fn(),
  };
  return mock as unknown as DbPool;
}

const fakeBillId = 'bill-uuid-1';
const fakeSessionId = 'session-uuid-1';

describe('createSentimentsRepository', () => {
  describe('getSentimentCounts', () => {
    it('returns zero counts when no submissions exist', async () => {
      const pool = makePoolMock();
      const repo = createSentimentsRepository(pool);
      const counts = await repo.getSentimentCounts(fakeBillId);
      expect(counts).toEqual({ support: 0, oppose: 0, neutral: 0, total: 0 });
    });

    it('aggregates counts from query rows', async () => {
      const pool = makePoolMock({
        'sentiment_submissions': [
          { sentiment: 'support', count: '5' },
          { sentiment: 'oppose', count: '3' },
          { sentiment: 'neutral', count: '2' },
        ],
      });
      const repo = createSentimentsRepository(pool);
      const counts = await repo.getSentimentCounts(fakeBillId);
      expect(counts.support).toBe(5);
      expect(counts.oppose).toBe(3);
      expect(counts.neutral).toBe(2);
      expect(counts.total).toBe(10);
    });

    it('computes total correctly when some sentiments are absent', async () => {
      const pool = makePoolMock({
        'sentiment_submissions': [
          { sentiment: 'support', count: '7' },
        ],
      });
      const repo = createSentimentsRepository(pool);
      const counts = await repo.getSentimentCounts(fakeBillId);
      expect(counts.support).toBe(7);
      expect(counts.oppose).toBe(0);
      expect(counts.neutral).toBe(0);
      expect(counts.total).toBe(7);
    });
  });

  describe('submitSentiment', () => {
    it('returns isDuplicate: false on successful insert', async () => {
      const fakeRow = {
        id: 'sub-uuid-1',
        bill_id: fakeBillId,
        session_id: fakeSessionId,
        sentiment: 'support',
        submitted_at: new Date(),
      };
      const pool = makePoolMock({ 'INSERT INTO sentiment_submissions': [fakeRow] });
      const repo = createSentimentsRepository(pool);
      const result = await repo.submitSentiment(fakeBillId, fakeSessionId, 'support');
      expect(result.isDuplicate).toBe(false);
      expect(result.submission.sentiment).toBe('support');
    });

    it('returns isDuplicate: true on unique constraint violation', async () => {
      const existingRow = {
        id: 'sub-uuid-2',
        bill_id: fakeBillId,
        session_id: fakeSessionId,
        sentiment: 'oppose',
        submitted_at: new Date(),
      };

      // Make INSERT throw a unique violation, SELECT returns the existing row.
      const mock = {
        query: vi.fn(async (sql: string, _params?: unknown[]) => {
          if (sql.includes('INSERT INTO sentiment_submissions')) {
            const err = Object.assign(new Error('duplicate key'), { code: '23505' });
            throw err;
          }
          if (sql.includes('WHERE bill_id')) {
            return { rows: [existingRow], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
        connect: vi.fn(),
      };
      const pool = mock as unknown as DbPool;

      const repo = createSentimentsRepository(pool);
      const result = await repo.submitSentiment(fakeBillId, fakeSessionId, 'support');
      expect(result.isDuplicate).toBe(true);
      expect(result.submission.id).toBe('sub-uuid-2');
    });

    it('re-throws unexpected errors', async () => {
      const mock = {
        query: vi.fn(async (_sql: string) => {
          throw new Error('Connection refused');
        }),
        connect: vi.fn(),
      };
      const pool = mock as unknown as DbPool;

      const repo = createSentimentsRepository(pool);
      await expect(
        repo.submitSentiment(fakeBillId, fakeSessionId, 'neutral'),
      ).rejects.toThrow('Connection refused');
    });
  });
});
