import type { DbPool } from '@civiclens/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IngestionEventType =
  | 'run_start'
  | 'run_complete'
  | 'run_failure'
  | 'fetch_failure'
  | 'tag_override'
  | 'summary_revision'
  | 'sentiment_block';

export interface IngestionEvent {
  id: string;
  event_type: string;
  source: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
  occurred_at: string;
}

export interface LogEventInput {
  event_type: IngestionEventType | string;
  source: string;
  entity_type?: string;
  entity_id?: string;
  data?: Record<string, unknown>;
}

export interface QueryEventsOptions {
  event_type?: string;
  source?: string;
  entity_type?: string;
  since?: string;
  limit?: number;
  page?: number;
}

export interface AuditLogRepository {
  /** Insert a new audit event and return its generated UUID. */
  logEvent(event: LogEventInput): Promise<string>;
  /** Query audit events with optional filters. */
  queryEvents(opts: QueryEventsOptions): Promise<{ data: IngestionEvent[]; total: number; page: number; limit: number }>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createAuditLogRepository(pool: DbPool): AuditLogRepository {
  return {
    async logEvent(event) {
      const { event_type, source, entity_type, entity_id, data } = event;
      const result = await pool.query<{ id: string }>(
        `INSERT INTO ingestion_events (event_type, source, entity_type, entity_id, data)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id`,
        [event_type, source, entity_type ?? null, entity_id ?? null, JSON.stringify(data ?? {})],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error('logEvent: no id returned from INSERT');
      return id;
    },

    async queryEvents(opts) {
      const { event_type, source, entity_type, since, limit = 50, page = 1 } = opts;

      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (event_type) { conditions.push(`event_type = $${idx++}`); values.push(event_type); }
      if (source)     { conditions.push(`source = $${idx++}`);     values.push(source); }
      if (entity_type){ conditions.push(`entity_type = $${idx++}`);values.push(entity_type); }
      if (since)      { conditions.push(`occurred_at >= $${idx++}`);values.push(since); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM ingestion_events ${where}`,
        values,
      );
      const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

      const clampedLimit = Math.min(Math.max(limit, 1), 100);
      const clampedPage  = Math.max(page, 1);
      const offset       = (clampedPage - 1) * clampedLimit;

      const dataResult = await pool.query<{
        id: string;
        event_type: string;
        source: string;
        entity_type: string | null;
        entity_id: string | null;
        data: Record<string, unknown>;
        occurred_at: Date;
      }>(
        `SELECT id, event_type, source, entity_type, entity_id, data, occurred_at
         FROM ingestion_events ${where}
         ORDER BY occurred_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        [...values, clampedLimit, offset],
      );

      const events: IngestionEvent[] = dataResult.rows.map(r => ({
        id:          r.id,
        event_type:  r.event_type,
        source:      r.source,
        entity_type: r.entity_type,
        entity_id:   r.entity_id,
        data:        r.data,
        occurred_at: r.occurred_at.toISOString(),
      }));

      return { data: events, total, page: clampedPage, limit: clampedLimit };
    },
  };
}
