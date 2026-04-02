import type { DbPool, PoliticianRow, VoteRecordRow, VoteRow } from '@civiclens/db';

export interface VoteWithRecords extends VoteRow {
  records: VoteRecordRow[];
}

export interface VoteRecordWithPolitician extends VoteRecordRow {
  politician_first_name: string;
  politician_last_name: string;
  politician_party: string;
  politician_state: string;
  politician_chamber: 'senate' | 'house';
}

export function createVotesRepository(pool: DbPool) {
  /** Fetch a single vote event by primary key. Returns null if not found. */
  async function getVoteById(id: string): Promise<VoteRow | null> {
    const result = await pool.query<VoteRow>(`SELECT * FROM votes WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  /** Fetch all individual vote records (politician positions) for a roll-call vote. */
  async function getVoteRecords(voteId: string): Promise<VoteRecordRow[]> {
    const result = await pool.query<VoteRecordRow>(
      `SELECT vr.*
       FROM vote_records vr
       WHERE vr.vote_id = $1
       ORDER BY vr.created_at ASC`,
      [voteId],
    );
    return result.rows;
  }

  /**
   * Fetch a vote together with all its individual records in one call.
   * Returns null if the vote does not exist.
   */
  async function getVoteWithRecords(id: string): Promise<VoteWithRecords | null> {
    const vote = await getVoteById(id);
    if (!vote) return null;
    const records = await getVoteRecords(id);
    return { ...vote, records };
  }

  /** Fetch all votes for a bill ordered by date descending. */
  async function getVotesByBillId(billId: string): Promise<VoteRow[]> {
    const result = await pool.query<VoteRow>(
      `SELECT * FROM votes WHERE bill_id = $1 ORDER BY vote_date DESC`,
      [billId],
    );
    return result.rows;
  }

  /** Fetch vote records for a roll-call vote joined with politician details. */
  async function getVoteRecordsWithPoliticians(
    voteId: string,
  ): Promise<VoteRecordWithPolitician[]> {
    const result = await pool.query<VoteRecordWithPolitician>(
      `SELECT vr.*,
              p.first_name AS politician_first_name,
              p.last_name  AS politician_last_name,
              p.party      AS politician_party,
              p.state      AS politician_state,
              p.chamber    AS politician_chamber
       FROM vote_records vr
       JOIN politicians p ON p.id = vr.politician_id
       WHERE vr.vote_id = $1
       ORDER BY p.last_name ASC, p.first_name ASC`,
      [voteId],
    );
    return result.rows;
  }

  return {
    getVoteById,
    getVoteRecords,
    getVoteWithRecords,
    getVotesByBillId,
    getVoteRecordsWithPoliticians,
  };
}

export type VotesRepository = ReturnType<typeof createVotesRepository>;
