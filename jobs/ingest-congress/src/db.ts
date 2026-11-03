/**
 * db.ts
 *
 * Idempotent database upsert helpers for the ingestion pipeline.
 * All operations use ON CONFLICT … DO UPDATE so repeated runs are safe.
 *
 * Deduplication keys:
 *   politicians  → bioguide_id (UNIQUE)
 *   bills        → (congress, bill_type, bill_number) (UNIQUE)
 *   votes        → source_id (partial UNIQUE index on non-null values)
 *   vote_records → (vote_id, politician_id) (UNIQUE)
 *   raw_payloads → stored on every fetch; caller decides whether to skip
 */

import { createHash } from 'node:crypto';
import type { DbPool } from '@civreveal/db';
import type { NormalizedBill, NormalizedPolitician, NormalizedVote, NormalizedVoteRecord } from './normalize.js';
import type { DerivedTag } from './tagging.js';

// ─────────────────────────────────────────────────────────────────────────────
// Audit / ingestion event helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert an ingestion audit event row.
 * Failures are silently ignored so that an audit write never aborts a run.
 */
export async function insertIngestionEvent(
  pool: DbPool,
  event: {
    event_type: string;
    source: string;
    entity_type?: string;
    entity_id?: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ingestion_events (event_type, source, entity_type, entity_id, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        event.event_type,
        event.source,
        event.entity_type ?? null,
        event.entity_id ?? null,
        JSON.stringify(event.data ?? {}),
      ],
    );
  } catch {
    // Audit failures must never abort a data run; log to stderr only.
    process.stderr.write(`[audit] Failed to write ingestion event: ${event.event_type}\n`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw payload helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a raw API payload for audit purposes.
 * Returns true if the payload is new or changed (checksum differs), false if
 * it is identical to the most-recent stored entry for this source + id.
 */
export async function saveRawPayload(
  pool: DbPool,
  sourceSystem: string,
  sourceId: string,
  payload: unknown,
): Promise<boolean> {
  const payloadText = JSON.stringify(payload);
  const checksum = createHash('sha256').update(payloadText).digest('hex');

  // Check whether we already have an identical payload
  const existing = await pool.query<{ checksum: string | null }>(
    `SELECT checksum FROM raw_payloads
     WHERE source_system = $1 AND source_id = $2
     ORDER BY retrieved_at DESC
     LIMIT 1`,
    [sourceSystem, sourceId],
  );
  if (existing.rows[0]?.checksum === checksum) {
    return false; // No change
  }

  await pool.query(
    `INSERT INTO raw_payloads (source_system, source_id, payload, checksum, retrieved_at)
     VALUES ($1, $2, $3::jsonb, $4, NOW())
     ON CONFLICT (source_system, source_id, retrieved_at) DO NOTHING`,
    [sourceSystem, sourceId, payloadText, checksum],
  );
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Politicians
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a politician by bioguide_id.
 * Returns the internal UUID for the politician (existing or newly inserted).
 */
export async function upsertPolitician(
  pool: DbPool,
  politician: NormalizedPolitician,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO politicians
       (bioguide_id, first_name, last_name, party, state, chamber, district, image_url, website, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (bioguide_id) DO UPDATE SET
       first_name  = EXCLUDED.first_name,
       last_name   = EXCLUDED.last_name,
       party       = EXCLUDED.party,
       state       = EXCLUDED.state,
       chamber     = EXCLUDED.chamber,
       district    = EXCLUDED.district,
       image_url   = EXCLUDED.image_url,
       website     = EXCLUDED.website,
       updated_at  = NOW()
     RETURNING id`,
    [
      politician.bioguideId,
      politician.firstName,
      politician.lastName,
      politician.party,
      politician.state,
      politician.chamber,
      politician.district,
      politician.imageUrl,
      politician.website,
    ],
  );

  const id = result.rows[0]?.id;
  if (!id) throw new Error(`upsertPolitician: no id returned for ${politician.bioguideId}`);
  return id;
}

/**
 * Look up the internal UUID for a politician by bioguide_id.
 * Returns null if not found.
 */
export async function findPoliticianId(
  pool: DbPool,
  bioguideId: string,
): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM politicians WHERE bioguide_id = $1`,
    [bioguideId],
  );
  return result.rows[0]?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bills
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a bill by its composite business key (congress, bill_type, bill_number).
 * `sponsorInternalId` must be the UUID of the sponsoring politician already in DB.
 * Returns the internal UUID of the bill.
 */
export async function upsertBill(
  pool: DbPool,
  bill: NormalizedBill,
  sponsorInternalId: string,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO bills
       (congress, bill_type, bill_number, title, summary, status, sponsor_id, introduced_at,
        policy_area, subjects, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], NOW())
     ON CONFLICT (congress, bill_type, bill_number) DO UPDATE SET
       title         = EXCLUDED.title,
       summary       = EXCLUDED.summary,
       status        = EXCLUDED.status,
       sponsor_id    = EXCLUDED.sponsor_id,
       introduced_at = EXCLUDED.introduced_at,
       policy_area   = EXCLUDED.policy_area,
       subjects      = EXCLUDED.subjects,
       updated_at    = NOW()
     RETURNING id`,
    [
      bill.congress,
      bill.billType,
      bill.billNumber,
      bill.title,
      bill.summary,
      bill.status,
      sponsorInternalId,
      bill.introducedAt.toISOString(),
      bill.policyArea,
      bill.subjects,
    ],
  );

  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(
      `upsertBill: no id returned for ${bill.congress}-${bill.billType}-${bill.billNumber}`,
    );
  }
  return id;
}

/**
 * Look up the internal UUID for a bill by its business key.
 * Returns null if not found.
 */
export async function findBillId(
  pool: DbPool,
  congress: number,
  billType: string,
  billNumber: string,
): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM bills WHERE congress = $1 AND bill_type = $2 AND bill_number = $3`,
    [congress, billType, billNumber],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Replace the automatically derived policy tags for a bill.
 *
 * Tags with source 'manual' are never touched: they survive re-ingestion and
 * take precedence if the derivation would produce the same tag. Everything
 * else is recomputed from scratch so a change to the mapping rules (or to the
 * bill's official classification) is reflected on the next run.
 *
 * Returns the number of derived tags written.
 */
export async function replaceDerivedBillTags(
  pool: DbPool,
  billInternalId: string,
  tags: readonly DerivedTag[],
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM bill_tags WHERE bill_id = $1 AND source <> 'manual'`,
      [billInternalId],
    );

    let written = 0;
    if (tags.length > 0) {
      const result = await client.query(
        `INSERT INTO bill_tags (bill_id, policy_tag_id, source, matched_on)
         SELECT $1, pt.id, x.source, x.matched_on
         FROM unnest($2::text[], $3::text[], $4::text[]) AS x(slug, source, matched_on)
         JOIN policy_tags pt ON pt.slug = x.slug
         ON CONFLICT (bill_id, policy_tag_id) DO NOTHING`,
        [
          billInternalId,
          tags.map((t) => t.tag),
          tags.map((t) => t.source),
          tags.map((t) => t.matchedOn),
        ],
      );
      written = result.rowCount ?? 0;
    }

    await client.query('COMMIT');
    return written;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Votes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up the internal UUID for a vote by its source_id.
 * Returns null if not found.
 */
export async function findVoteId(
  pool: DbPool,
  sourceId: string,
): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM votes WHERE source_id = $1`,
    [sourceId],
  );
  return result.rows[0]?.id ?? null;
}


/**
 * Upsert a roll-call vote event.
 * Uses source_id as the deduplication key (partial unique index).
 * Returns the internal UUID of the vote.
 */
export async function upsertVote(
  pool: DbPool,
  vote: NormalizedVote,
  billInternalId: string | null,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO votes
       (bill_id, chamber, vote_date, result, yea_count, nay_count, abstain_count, not_voting_count, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET
       bill_id          = EXCLUDED.bill_id,
       vote_date        = EXCLUDED.vote_date,
       result           = EXCLUDED.result,
       yea_count        = EXCLUDED.yea_count,
       nay_count        = EXCLUDED.nay_count,
       abstain_count    = EXCLUDED.abstain_count,
       not_voting_count = EXCLUDED.not_voting_count
     RETURNING id`,
    [
      billInternalId,
      vote.chamber,
      vote.voteDate.toISOString(),
      vote.result,
      vote.yeaCount,
      vote.nayCount,
      vote.abstainCount,
      vote.notVotingCount,
      vote.sourceId,
    ],
  );

  const id = result.rows[0]?.id;
  if (!id) throw new Error(`upsertVote: no id returned for source_id=${vote.sourceId}`);
  return id;
}

/**
 * Load the bioguide_id → internal id map for every politician in one query.
 * Vote ingestion resolves hundreds of voters per roll-call; doing that with a
 * lookup per voter costs a database round trip each, which on a remote
 * database turned a 25-vote run into 13 minutes.
 */
export async function loadPoliticianIdMap(pool: DbPool): Promise<Map<string, string>> {
  const result = await pool.query<{ id: string; bioguide_id: string }>(
    `SELECT id, bioguide_id FROM politicians`,
  );
  return new Map(result.rows.map((r) => [r.bioguide_id, r.id]));
}

/**
 * Upsert every member position of one roll-call vote in a single statement.
 * Voters whose bioguide ID is not in `politicianIds` (e.g. former members not
 * yet ingested) are skipped and counted. If the same politician appears twice
 * the last position wins.
 */
export async function upsertVoteRecords(
  pool: DbPool,
  voteInternalId: string,
  records: readonly NormalizedVoteRecord[],
  politicianIds: ReadonlyMap<string, string>,
): Promise<{ written: number; unknownVoters: number }> {
  const byPolitician = new Map<string, string>();
  let unknownVoters = 0;
  for (const record of records) {
    const politicianId = politicianIds.get(record.voterBioguideId);
    if (!politicianId) {
      unknownVoters++;
      continue;
    }
    byPolitician.set(politicianId, record.value);
  }
  if (byPolitician.size === 0) return { written: 0, unknownVoters };

  const ids = [...byPolitician.keys()];
  const values = ids.map((id) => byPolitician.get(id) as string);
  await pool.query(
    `INSERT INTO vote_records (vote_id, politician_id, value)
     SELECT $1, x.politician_id, x.value
     FROM unnest($2::uuid[], $3::text[]) AS x(politician_id, value)
     ON CONFLICT (vote_id, politician_id) DO UPDATE SET
       value = EXCLUDED.value`,
    [voteInternalId, ids, values],
  );
  return { written: ids.length, unknownVoters };
}
