import type { DbPool, BillRow, PolicyTagRow, PoliticianRow, VoteRow } from '@civreveal/db';

export interface BillWithTags extends BillRow {
  tags: string[];
  sponsor_first_name: string;
  sponsor_last_name: string;
}

export interface ListBillsOptions {
  page?: number;
  limit?: number;
  status?: string;
  tag?: string;
  congress?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function createBillsRepository(pool: DbPool) {
  /**
   * Paginated list of bills with optional filters.
   * Returns each bill with its sponsor name and aggregated tag slugs.
   */
  async function listBills(
    options: ListBillsOptions = {},
  ): Promise<PaginatedResult<BillWithTags>> {
    const { page = 1, limit = 20, status, tag, congress } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`b.status = $${idx++}`);
      params.push(status);
    }
    if (congress) {
      conditions.push(`b.congress = $${idx++}`);
      params.push(congress);
    }
    if (tag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM bill_tags bt
        JOIN policy_tags pt ON pt.id = bt.policy_tag_id
        WHERE bt.bill_id = b.id AND pt.slug = $${idx++}
      )`);
      params.push(tag);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM bills b ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    params.push(limit, offset);
    const dataResult = await pool.query<BillWithTags>(
      `SELECT
         b.*,
         p.first_name AS sponsor_first_name,
         p.last_name  AS sponsor_last_name,
         COALESCE(
           ARRAY_AGG(pt.slug ORDER BY pt.slug) FILTER (WHERE pt.slug IS NOT NULL),
           ARRAY[]::TEXT[]
         ) AS tags
       FROM bills b
       JOIN politicians p ON p.id = b.sponsor_id
       LEFT JOIN bill_tags bt ON bt.bill_id = b.id
       LEFT JOIN policy_tags pt ON pt.id = bt.policy_tag_id
       ${where}
       GROUP BY b.id, p.first_name, p.last_name
       ORDER BY b.introduced_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params,
    );

    return { data: dataResult.rows, total, page, limit };
  }

  /** Fetch a single bill with its tags and sponsor. Returns null if not found. */
  async function getBillById(id: string): Promise<BillWithTags | null> {
    const result = await pool.query<BillWithTags>(
      `SELECT
         b.*,
         p.first_name AS sponsor_first_name,
         p.last_name  AS sponsor_last_name,
         COALESCE(
           ARRAY_AGG(pt.slug ORDER BY pt.slug) FILTER (WHERE pt.slug IS NOT NULL),
           ARRAY[]::TEXT[]
         ) AS tags
       FROM bills b
       JOIN politicians p ON p.id = b.sponsor_id
       LEFT JOIN bill_tags bt ON bt.bill_id = b.id
       LEFT JOIN policy_tags pt ON pt.id = bt.policy_tag_id
       WHERE b.id = $1
       GROUP BY b.id, p.first_name, p.last_name`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** Full-text search across bill title and summary. */
  async function searchBills(
    query: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResult<BillWithTags>> {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;
    // plainto_tsquery treats the input as plain text, safely handling special
    // characters that would break to_tsquery (e.g. &, |, !, parentheses).
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM bills b
       WHERE to_tsvector('english', b.title || ' ' || COALESCE(b.summary, ''))
             @@ plainto_tsquery('english', $1)`,
      [query],
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const dataResult = await pool.query<BillWithTags>(
      `SELECT
         b.*,
         p.first_name AS sponsor_first_name,
         p.last_name  AS sponsor_last_name,
         COALESCE(
           ARRAY_AGG(pt.slug ORDER BY pt.slug) FILTER (WHERE pt.slug IS NOT NULL),
           ARRAY[]::TEXT[]
         ) AS tags
       FROM bills b
       JOIN politicians p ON p.id = b.sponsor_id
       LEFT JOIN bill_tags bt ON bt.bill_id = b.id
       LEFT JOIN policy_tags pt ON pt.id = bt.policy_tag_id
       WHERE to_tsvector('english', b.title || ' ' || COALESCE(b.summary, ''))
             @@ plainto_tsquery('english', $1)
       GROUP BY b.id, p.first_name, p.last_name
       ORDER BY b.introduced_at DESC
       LIMIT $2 OFFSET $3`,
      [query, limit, offset],
    );

    return { data: dataResult.rows, total, page, limit };
  }

  /** Fetch votes (roll-call events) for a specific bill. */
  async function getBillVotes(billId: string): Promise<VoteRow[]> {
    const result = await pool.query<VoteRow>(
      `SELECT * FROM votes WHERE bill_id = $1 ORDER BY vote_date DESC`,
      [billId],
    );
    return result.rows;
  }

  /** Fetch all policy tags for a bill. */
  async function getBillTags(billId: string): Promise<PolicyTagRow[]> {
    const result = await pool.query<PolicyTagRow>(
      `SELECT pt.*
       FROM policy_tags pt
       JOIN bill_tags bt ON bt.policy_tag_id = pt.id
       WHERE bt.bill_id = $1
       ORDER BY pt.slug`,
      [billId],
    );
    return result.rows;
  }

  /** Fetch the sponsor politician for a bill. */
  async function getBillSponsor(billId: string): Promise<PoliticianRow | null> {
    const result = await pool.query<PoliticianRow>(
      `SELECT p.*
       FROM politicians p
       JOIN bills b ON b.sponsor_id = p.id
       WHERE b.id = $1`,
      [billId],
    );
    return result.rows[0] ?? null;
  }

  return { listBills, getBillById, searchBills, getBillVotes, getBillTags, getBillSponsor };
}

export type BillsRepository = ReturnType<typeof createBillsRepository>;
