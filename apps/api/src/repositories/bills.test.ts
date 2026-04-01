import { describe, it, expect, vi } from 'vitest';
import { createBillsRepository } from '../repositories/bills.js';
import type { DbPool } from '@civiclens/db';

/** Minimal pool mock: query() returns empty rows by default. */
function makePoolMock(overrides: Record<string, unknown[]> = {}) {
  const mock = {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      // Match specific query patterns and return canned data
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

const fakeBill = {
  id: 'bill-uuid-1',
  congress: 118,
  bill_type: 'HR',
  bill_number: '1234',
  title: 'Affordable Care Expansion Act',
  summary: 'Expands Medicaid',
  status: 'committee',
  sponsor_id: 'pol-uuid-1',
  introduced_at: new Date('2023-02-15'),
  created_at: new Date(),
  updated_at: new Date(),
  sponsor_first_name: 'Alice',
  sponsor_last_name: 'Anderson',
  tags: ['healthcare'],
};

describe('createBillsRepository', () => {
  describe('getBillById', () => {
    it('returns a bill when found', async () => {
      const pool = makePoolMock({ 'WHERE b.id': [fakeBill] });
      const repo = createBillsRepository(pool);
      const bill = await repo.getBillById('bill-uuid-1');
      expect(bill).not.toBeNull();
      expect(bill?.id).toBe('bill-uuid-1');
      expect(bill?.title).toBe('Affordable Care Expansion Act');
    });

    it('returns null when the bill is not found', async () => {
      const pool = makePoolMock();
      const repo = createBillsRepository(pool);
      const bill = await repo.getBillById('nonexistent-id');
      expect(bill).toBeNull();
    });
  });

  describe('listBills', () => {
    it('returns paginated bills', async () => {
      const pool = makePoolMock({
        'COUNT(*)': [{ count: '1' }],
        'GROUP BY': [fakeBill],
      });
      const repo = createBillsRepository(pool);
      const result = await repo.listBills({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data).toHaveLength(1);
    });

    it('applies default pagination when no options given', async () => {
      const pool = makePoolMock({ 'COUNT(*)': [{ count: '0' }] });
      const repo = createBillsRepository(pool);
      const result = await repo.listBills();
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('searchBills', () => {
    it('returns results for a search query', async () => {
      const pool = makePoolMock({
        'COUNT(*)': [{ count: '1' }],
        'to_tsquery': [fakeBill],
      });
      const repo = createBillsRepository(pool);
      const result = await repo.searchBills('care', { page: 1, limit: 10 });
      expect(result.total).toBe(1);
      expect(result.data[0]?.title).toBe('Affordable Care Expansion Act');
    });
  });

  describe('getBillVotes', () => {
    it('returns an empty array when no votes exist', async () => {
      const pool = makePoolMock();
      const repo = createBillsRepository(pool);
      const votes = await repo.getBillVotes('bill-uuid-1');
      expect(votes).toEqual([]);
    });
  });
});
