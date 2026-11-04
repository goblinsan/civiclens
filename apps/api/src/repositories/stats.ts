import type { DbPool } from '@civreveal/db';

/** Headline numbers for the home page: what the database holds and how fresh it is. */
export interface SiteStats {
  /** Sitting members of Congress. */
  members: number;
  bills: number;
  /** Bills carrying at least one policy tag (the ones that can affect scores). */
  bills_tagged: number;
  house_votes: number;
  senate_votes: number;
  /** Individual member positions recorded across all roll-calls. */
  vote_records: number;
  /** When the ingest job last completed, ISO-8601; null before the first run. */
  last_ingest_at: string | null;
}

interface StatsRow {
  members: string;
  bills: string;
  bills_tagged: string;
  house_votes: string;
  senate_votes: string;
  vote_records: string;
  last_ingest_at: Date | null;
}

export function createStatsRepository(pool: DbPool) {
  async function getStats(): Promise<SiteStats> {
    const result = await pool.query<StatsRow>(
      `SELECT
         (SELECT COUNT(*) FROM politicians WHERE is_current)                         AS members,
         (SELECT COUNT(*) FROM bills)                                                 AS bills,
         (SELECT COUNT(*) FROM bills b
            WHERE EXISTS (SELECT 1 FROM bill_tags bt WHERE bt.bill_id = b.id))        AS bills_tagged,
         (SELECT COUNT(*) FROM votes WHERE chamber = 'house')                         AS house_votes,
         (SELECT COUNT(*) FROM votes WHERE chamber = 'senate')                        AS senate_votes,
         (SELECT COUNT(*) FROM vote_records)                                          AS vote_records,
         (SELECT MAX(occurred_at) FROM ingestion_events
            WHERE event_type = 'run_complete' AND source = 'ingest-congress')          AS last_ingest_at`,
    );
    const row = result.rows[0];
    const n = (v: string | undefined) => parseInt(v ?? '0', 10);
    return {
      members: n(row?.members),
      bills: n(row?.bills),
      bills_tagged: n(row?.bills_tagged),
      house_votes: n(row?.house_votes),
      senate_votes: n(row?.senate_votes),
      vote_records: n(row?.vote_records),
      last_ingest_at: row?.last_ingest_at ? row.last_ingest_at.toISOString() : null,
    };
  }

  return { getStats };
}

export type StatsRepository = ReturnType<typeof createStatsRepository>;
