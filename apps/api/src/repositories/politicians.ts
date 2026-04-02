import type { DbPool, PoliticianRow, VoteRecordRow, VoteRow } from '@civiclens/db';

export interface ListPoliticiansOptions {
  page?: number;
  limit?: number;
  chamber?: 'senate' | 'house';
  party?: string;
  state?: string;
  q?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function createPoliticiansRepository(pool: DbPool) {
  /** Paginated list of politicians with optional filters. */
  async function listPoliticians(
    options: ListPoliticiansOptions = {},
  ): Promise<PaginatedResult<PoliticianRow>> {
    const { page = 1, limit = 20, chamber, party, state, q } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (chamber) {
      conditions.push(`chamber = $${idx++}`);
      params.push(chamber);
    }
    if (party) {
      conditions.push(`party = $${idx++}`);
      params.push(party);
    }
    if (state) {
      conditions.push(`state = $${idx++}`);
      params.push(state);
    }
    if (q) {
      conditions.push(
        `(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR (first_name || ' ' || last_name) ILIKE $${idx})`,
      );
      params.push(`%${q}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM politicians ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    params.push(limit, offset);
    const dataResult = await pool.query<PoliticianRow>(
      `SELECT * FROM politicians ${where}
       ORDER BY last_name ASC, first_name ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params,
    );

    return { data: dataResult.rows, total, page, limit };
  }

  /** Fetch a single politician by primary key. Returns null if not found. */
  async function getPoliticianById(id: string): Promise<PoliticianRow | null> {
    const result = await pool.query<PoliticianRow>(
      `SELECT * FROM politicians WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** Fetch a politician by their bioguide_id. Returns null if not found. */
  async function getPoliticianByBioguideId(bioguideId: string): Promise<PoliticianRow | null> {
    const result = await pool.query<PoliticianRow>(
      `SELECT * FROM politicians WHERE bioguide_id = $1`,
      [bioguideId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Paginated vote records for a politician.
   * Joins vote metadata so callers get the roll-call context alongside the record.
   */
  async function getPoliticianVotes(
    politicianId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResult<VoteRecordRow & Pick<VoteRow, 'vote_date' | 'chamber' | 'bill_id'>>> {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM vote_records WHERE politician_id = $1`,
      [politicianId],
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const dataResult = await pool.query<
      VoteRecordRow & Pick<VoteRow, 'vote_date' | 'chamber' | 'bill_id'>
    >(
      `SELECT vr.*, v.vote_date, v.chamber, v.bill_id
       FROM vote_records vr
       JOIN votes v ON v.id = vr.vote_id
       WHERE vr.politician_id = $1
       ORDER BY v.vote_date DESC
       LIMIT $2 OFFSET $3`,
      [politicianId, limit, offset],
    );

    return { data: dataResult.rows, total, page, limit };
  }

  return {
    listPoliticians,
    getPoliticianById,
    getPoliticianByBioguideId,
    getPoliticianVotes,
  };
}

export type PoliticiansRepository = ReturnType<typeof createPoliticiansRepository>;
