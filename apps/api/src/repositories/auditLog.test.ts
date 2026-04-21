import { describe, it, expect, vi } from 'vitest';
import { createAuditLogRepository } from '../repositories/auditLog.js';
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

const fakeEvent = {
  id: 'event-uuid-1',
  event_type: 'run_complete',
  source: 'ingest-congress',
  entity_type: null,
  entity_id: null,
  data: { durationMs: 1234 },
  occurred_at: new Date('2026-01-01T00:00:00Z'),
};

describe('createAuditLogRepository', () => {
  describe('logEvent', () => {
    it('returns the generated id on successful insert', async () => {
      const pool = makePoolMock({
        'INSERT INTO ingestion_events': [{ id: 'event-uuid-1' }],
      });
      const repo = createAuditLogRepository(pool);
      const id = await repo.logEvent({
        event_type: 'run_complete',
        source: 'ingest-congress',
        data: { durationMs: 1234 },
      });
      expect(id).toBe('event-uuid-1');
    });

    it('throws when the INSERT returns no id', async () => {
      const pool = makePoolMock();
      const repo = createAuditLogRepository(pool);
      await expect(
        repo.logEvent({ event_type: 'run_start', source: 'ingest-congress' }),
      ).rejects.toThrow('logEvent: no id returned from INSERT');
    });

    it('passes optional entity_type and entity_id to the query', async () => {
      const pool = makePoolMock({
        'INSERT INTO ingestion_events': [{ id: 'event-uuid-2' }],
      });
      const repo = createAuditLogRepository(pool);
      await repo.logEvent({
        event_type: 'sentiment_block',
        source: 'api',
        entity_type: 'sentiment',
        entity_id: 'bill-uuid-1',
        data: { reason: 'rate_limit' },
      });
      const [, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
      expect(params[2]).toBe('sentiment');
      expect(params[3]).toBe('bill-uuid-1');
    });
  });

  describe('queryEvents', () => {
    it('returns events and total count', async () => {
      const pool = makePoolMock({
        'COUNT(*)': [{ count: '1' }],
        'SELECT id': [fakeEvent],
      });
      const repo = createAuditLogRepository(pool);
      const result = await repo.queryEvents({});
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].event_type).toBe('run_complete');
    });

    it('returns an empty array when no events match', async () => {
      const pool = makePoolMock({
        'COUNT(*)': [{ count: '0' }],
      });
      const repo = createAuditLogRepository(pool);
      const result = await repo.queryEvents({ event_type: 'fetch_failure' });
      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('clamps limit to a maximum of 100', async () => {
      const pool = makePoolMock({
        'COUNT(*)': [{ count: '0' }],
      });
      const repo = createAuditLogRepository(pool);
      const result = await repo.queryEvents({ limit: 999 });
      expect(result.limit).toBe(100);
    });

    it('returns occurred_at as an ISO-8601 string', async () => {
      const pool = makePoolMock({
        'COUNT(*)': [{ count: '1' }],
        'SELECT id': [fakeEvent],
      });
      const repo = createAuditLogRepository(pool);
      const result = await repo.queryEvents({});
      expect(result.data[0].occurred_at).toBe('2026-01-01T00:00:00.000Z');
    });
  });
});
