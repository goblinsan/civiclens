import { describe, it, expect, vi } from 'vitest';
import { createPoliticiansRepository } from '../repositories/politicians.js';
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

const fakePolitician = {
  id: 'pol-uuid-1',
  bioguide_id: 'A000001',
  first_name: 'Alice',
  last_name: 'Anderson',
  party: 'Democrat',
  state: 'CA',
  chamber: 'senate' as const,
  district: null,
  image_url: null,
  website: null,
  office_id: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('createPoliticiansRepository', () => {
  describe('getPoliticianById', () => {
    it('returns the politician when found', async () => {
      const pool = makePoolMock({ 'WHERE id': [fakePolitician] });
      const repo = createPoliticiansRepository(pool);
      const pol = await repo.getPoliticianById('pol-uuid-1');
      expect(pol).not.toBeNull();
      expect(pol?.bioguide_id).toBe('A000001');
    });

    it('returns null when not found', async () => {
      const pool = makePoolMock();
      const repo = createPoliticiansRepository(pool);
      const pol = await repo.getPoliticianById('nonexistent');
      expect(pol).toBeNull();
    });
  });

  describe('listPoliticians', () => {
    it('returns paginated politicians', async () => {
      const pool = makePoolMock({
        'COUNT(*)': [{ count: '2' }],
        'ORDER BY': [fakePolitician, { ...fakePolitician, id: 'pol-uuid-2' }],
      });
      const repo = createPoliticiansRepository(pool);
      const result = await repo.listPoliticians({ page: 1, limit: 10 });
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('getPoliticianVotes', () => {
    it('returns empty results when no votes', async () => {
      const pool = makePoolMock({ 'COUNT(*)': [{ count: '0' }] });
      const repo = createPoliticiansRepository(pool);
      const result = await repo.getPoliticianVotes('pol-uuid-1');
      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });
  });
});
