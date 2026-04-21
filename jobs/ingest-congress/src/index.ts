/**
 * index.ts — CivReveal Congress ingestion pipeline
 *
 * Pulls official government data from api.congress.gov, Senate.gov, and the
 * House Clerk XML feeds, normalises it, and upserts it into the database.
 *
 * Environment variables:
 *   CONGRESS_API_KEY   (required) – api.congress.gov API key
 *   DATABASE_URL       (required) – PostgreSQL connection string
 *   CONGRESS           (optional) – congress number to sync, default 119
 *   SENATE_SESSION     (optional) – senate session number, default 1
 *   HOUSE_YEAR         (optional) – year for House vote feed, default current year
 *   SYNC_SINCE         (optional) – ISO-8601 datetime; only fetch bills updated after this
 *   MAX_BILLS          (optional) – max bills to fetch per run (0 = no limit)
 *   MAX_VOTES          (optional) – max votes per chamber per run (0 = no limit)
 *   LOG_LEVEL          (optional) – trace/debug/info/warn/error/fatal, default info
 */

import { z } from 'zod';
import { getPool, closePool } from '@civreveal/db';
import { createLogger } from './logger.js';
import { createCongressClient } from './congress-client.js';
import { createVoteClient } from './vote-client.js';
import {
  normalizeMember,
  normalizeBill,
  normalizeVoteEvent,
} from './normalize.js';
import {
  upsertPolitician,
  upsertBill,
  upsertVote,
  upsertVoteRecord,
  saveRawPayload,
  findPoliticianId,
  findBillId,
  findVoteId,
  insertIngestionEvent,
} from './db.js';
import type { DbPool } from '@civreveal/db';
import type { Logger } from './logger.js';
import type { CongressClient } from './congress-client.js';
import type { VoteClient } from './vote-client.js';

// ─────────────────────────────────────────────────────────────────────────────
// Environment validation
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  CONGRESS_API_KEY: z.string().min(1, 'CONGRESS_API_KEY is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CONGRESS: z.coerce.number().int().positive().default(119),
  SENATE_SESSION: z.coerce.number().int().positive().default(1),
  HOUSE_YEAR: z.coerce.number().int().positive().default(new Date().getFullYear()),
  SYNC_SINCE: z.string().optional(),
  MAX_BILLS: z.coerce.number().int().nonnegative().default(0),
  MAX_VOTES: z.coerce.number().int().nonnegative().default(50),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;

// ─────────────────────────────────────────────────────────────────────────────
// Ingestion sub-steps
// ─────────────────────────────────────────────────────────────────────────────

interface IngestStats {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

/**
 * Ingest all current congressional members.
 * Members are upserted by bioguide_id.
 */
async function ingestMembers(
  pool: DbPool,
  client: CongressClient,
  logger: Logger,
): Promise<IngestStats> {
  const stats: IngestStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  const rawMembers = await client.fetchMembers({ currentMember: true });
  logger.info('members fetched', { count: rawMembers.length });

  for (const raw of rawMembers) {
    try {
      const politician = normalizeMember(raw);
      if (!politician.bioguideId) {
        stats.skipped++;
        continue;
      }

      const changed = await saveRawPayload(pool, 'congress.gov', `member-${politician.bioguideId}`, raw);
      const existingId = await findPoliticianId(pool, politician.bioguideId);
      await upsertPolitician(pool, politician);

      if (existingId) {
        if (changed) stats.updated++;
        else stats.skipped++;
      } else {
        stats.inserted++;
      }
    } catch (err) {
      logger.error('failed to ingest member', {
        bioguideId: raw.bioguideId,
        err: String(err),
      });
      stats.failed++;
    }
  }

  return stats;
}

/**
 * Ingest bills for the given congress, optionally filtered by update date.
 * Bills are upserted by (congress, bill_type, bill_number).
 */
async function ingestBills(
  pool: DbPool,
  client: CongressClient,
  logger: Logger,
  congress: number,
  options: { updatedSince?: string | undefined; maxRecords?: number | undefined } = {},
): Promise<IngestStats> {
  const stats: IngestStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  const rawBills = await client.fetchBills(congress, {
    ...(options.updatedSince !== undefined && { updatedSince: options.updatedSince }),
    ...(options.maxRecords !== undefined && { maxRecords: options.maxRecords }),
  });
  logger.info('bills fetched', { count: rawBills.length });

  for (const rawSummary of rawBills) {
    try {
      // Fetch full bill detail including sponsor and summary text
      const raw = await client.fetchBillDetail(congress, rawSummary.type, rawSummary.number);
      if (!raw) {
        stats.skipped++;
        continue;
      }

      const bill = normalizeBill(raw);

      if (!bill.sponsorBioguideId) {
        logger.warn('bill has no sponsor, skipping', {
          congress: bill.congress,
          type: bill.billType,
          number: bill.billNumber,
        });
        stats.skipped++;
        continue;
      }

      const sponsorId = await findPoliticianId(pool, bill.sponsorBioguideId);
      if (!sponsorId) {
        logger.warn('bill sponsor not found in db, skipping', {
          bioguideId: bill.sponsorBioguideId,
          billType: bill.billType,
          billNumber: bill.billNumber,
        });
        stats.skipped++;
        continue;
      }

      const changed = await saveRawPayload(
        pool,
        'congress.gov',
        `bill-${congress}-${bill.billType}-${bill.billNumber}`,
        raw,
      );
      const existingId = await findBillId(pool, bill.congress, bill.billType, bill.billNumber);
      await upsertBill(pool, bill, sponsorId);

      if (existingId) {
        if (changed) stats.updated++;
        else stats.skipped++;
      } else {
        stats.inserted++;
      }
    } catch (err) {
      logger.error('failed to ingest bill', {
        congress,
        type: rawSummary.type,
        number: rawSummary.number,
        err: String(err),
      });
      stats.failed++;
    }
  }

  return stats;
}

/**
 * Ingest Senate roll-call votes.
 * Votes are upserted by source_id; vote records by (vote_id, politician_id).
 */
async function ingestSenateVotes(
  pool: DbPool,
  voteClient: VoteClient,
  logger: Logger,
  congress: number,
  session: number,
  options: { maxVotes?: number | undefined } = {},
): Promise<IngestStats> {
  const stats: IngestStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  const events = await voteClient.fetchSenateVotes(congress, session, {
    ...(options.maxVotes !== undefined && { maxVotes: options.maxVotes }),
  });
  logger.info('senate votes fetched', { count: events.length });

  for (const event of events) {
    try {
      const { vote, records } = normalizeVoteEvent(event);

      // Resolve linked bill (if any)
      let billId: string | null = null;
      if (vote.billCongress && vote.billType && vote.billNumber) {
        billId = await findBillId(pool, vote.billCongress, vote.billType, vote.billNumber);
      }

      const existingVoteId = await findVoteId(pool, event.sourceId);
      await saveRawPayload(pool, 'senate.gov', event.sourceId, event);
      const voteId = await upsertVote(pool, vote, billId);

      // Upsert individual vote records
      let recordsInserted = 0;
      for (const record of records) {
        try {
          const politicianId = await findPoliticianId(pool, record.voterBioguideId);
          if (!politicianId) continue;
          await upsertVoteRecord(pool, voteId, politicianId, record);
          recordsInserted++;
        } catch (err) {
          logger.warn('failed to upsert vote record', {
            voteSourceId: event.sourceId,
            bioguideId: record.voterBioguideId,
            err: String(err),
          });
        }
      }

      if (existingVoteId) stats.updated++;
      else stats.inserted++;

      logger.debug('senate vote upserted', {
        sourceId: event.sourceId,
        recordsInserted,
      });
    } catch (err) {
      logger.error('failed to ingest senate vote', {
        sourceId: event.sourceId,
        err: String(err),
      });
      stats.failed++;
    }
  }

  return stats;
}

/**
 * Ingest House roll-call votes.
 */
async function ingestHouseVotes(
  pool: DbPool,
  voteClient: VoteClient,
  logger: Logger,
  congress: number,
  year: number,
  options: { maxVotes?: number | undefined } = {},
): Promise<IngestStats> {
  const stats: IngestStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  const events = await voteClient.fetchHouseVotes(congress, year, {
    ...(options.maxVotes !== undefined && { maxVotes: options.maxVotes }),
  });
  logger.info('house votes fetched', { count: events.length });

  for (const event of events) {
    try {
      const { vote, records } = normalizeVoteEvent(event);

      let billId: string | null = null;
      if (vote.billCongress && vote.billType && vote.billNumber) {
        billId = await findBillId(pool, vote.billCongress, vote.billType, vote.billNumber);
      }

      const existingVoteId = await findVoteId(pool, event.sourceId);
      await saveRawPayload(pool, 'house.gov', event.sourceId, event);
      const voteId = await upsertVote(pool, vote, billId);

      let recordsInserted = 0;
      for (const record of records) {
        try {
          const politicianId = await findPoliticianId(pool, record.voterBioguideId);
          if (!politicianId) continue;
          await upsertVoteRecord(pool, voteId, politicianId, record);
          recordsInserted++;
        } catch (err) {
          logger.warn('failed to upsert house vote record', {
            voteSourceId: event.sourceId,
            bioguideId: record.voterBioguideId,
            err: String(err),
          });
        }
      }

      if (existingVoteId) stats.updated++;
      else stats.inserted++;

      logger.debug('house vote upserted', {
        sourceId: event.sourceId,
        recordsInserted,
      });
    } catch (err) {
      logger.error('failed to ingest house vote', {
        sourceId: event.sourceId,
        err: String(err),
      });
      stats.failed++;
    }
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const baseLogger = createLogger(env.LOG_LEVEL);
  const startMs = Date.now();

  baseLogger.info('ingest-congress starting', {
    congress: env.CONGRESS,
    senateSession: env.SENATE_SESSION,
    houseYear: env.HOUSE_YEAR,
    syncSince: env.SYNC_SINCE,
    maxBills: env.MAX_BILLS,
    maxVotes: env.MAX_VOTES,
  });

  const pool = getPool(env.DATABASE_URL);

  // ── Audit: run start ───────────────────────────────────────────────────────
  const jobId = await insertIngestionEvent(pool, {
    event_type: 'run_start',
    source: 'ingest-congress',
    data: {
      congress: env.CONGRESS,
      senateSession: env.SENATE_SESSION,
      houseYear: env.HOUSE_YEAR,
      syncSince: env.SYNC_SINCE ?? null,
      maxBills: env.MAX_BILLS,
      maxVotes: env.MAX_VOTES,
    },
  });

  // Bind jobId to all subsequent log entries for full run correlation.
  const logger = baseLogger.child({ jobId });
  const congressClient = createCongressClient(env.CONGRESS_API_KEY, logger);
  const voteClient = createVoteClient(logger);

  let memberStats: IngestStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  let billStats: IngestStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  let senateVoteStats: IngestStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  let houseVoteStats: IngestStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  // ── 1. Ingest members ─────────────────────────────────────────────────────
  try {
    logger.info('step 1/4: ingesting members');
    memberStats = await ingestMembers(pool, congressClient, logger);
    logger.info('members ingested', { ...memberStats });
  } catch (err) {
    logger.error('member ingestion failed', { err: String(err) });
    await insertIngestionEvent(pool, {
      event_type: 'fetch_failure',
      source: 'ingest-congress',
      entity_type: 'members',
      data: { error: String(err) },
    });
  }

  // ── 2. Ingest bills ───────────────────────────────────────────────────────
  try {
    logger.info('step 2/4: ingesting bills', { congress: env.CONGRESS });
    const billOptions: { updatedSince?: string; maxRecords?: number } = {};
    if (env.SYNC_SINCE !== undefined) billOptions.updatedSince = env.SYNC_SINCE;
    if (env.MAX_BILLS > 0) billOptions.maxRecords = env.MAX_BILLS;
    billStats = await ingestBills(pool, congressClient, logger, env.CONGRESS, billOptions);
    logger.info('bills ingested', { ...billStats });
  } catch (err) {
    logger.error('bill ingestion failed', { err: String(err) });
    await insertIngestionEvent(pool, {
      event_type: 'fetch_failure',
      source: 'ingest-congress',
      entity_type: 'bills',
      data: { congress: env.CONGRESS, error: String(err) },
    });
  }

  // ── 3. Ingest Senate votes ────────────────────────────────────────────────
  try {
    logger.info('step 3/4: ingesting senate votes', {
      congress: env.CONGRESS,
      session: env.SENATE_SESSION,
    });
    const senateOptions: { maxVotes?: number } = {};
    if (env.MAX_VOTES > 0) senateOptions.maxVotes = env.MAX_VOTES;
    senateVoteStats = await ingestSenateVotes(
      pool,
      voteClient,
      logger,
      env.CONGRESS,
      env.SENATE_SESSION,
      senateOptions,
    );
    logger.info('senate votes ingested', { ...senateVoteStats });
  } catch (err) {
    logger.error('senate vote ingestion failed', { err: String(err) });
    await insertIngestionEvent(pool, {
      event_type: 'fetch_failure',
      source: 'ingest-congress',
      entity_type: 'senate_votes',
      data: { congress: env.CONGRESS, session: env.SENATE_SESSION, error: String(err) },
    });
  }

  // ── 4. Ingest House votes ─────────────────────────────────────────────────
  try {
    logger.info('step 4/4: ingesting house votes', {
      congress: env.CONGRESS,
      year: env.HOUSE_YEAR,
    });
    const houseOptions: { maxVotes?: number } = {};
    if (env.MAX_VOTES > 0) houseOptions.maxVotes = env.MAX_VOTES;
    houseVoteStats = await ingestHouseVotes(
      pool,
      voteClient,
      logger,
      env.CONGRESS,
      env.HOUSE_YEAR,
      houseOptions,
    );
    logger.info('house votes ingested', { ...houseVoteStats });
  } catch (err) {
    logger.error('house vote ingestion failed', { err: String(err) });
    await insertIngestionEvent(pool, {
      event_type: 'fetch_failure',
      source: 'ingest-congress',
      entity_type: 'house_votes',
      data: { congress: env.CONGRESS, year: env.HOUSE_YEAR, error: String(err) },
    });
  }

  const durationMs = Date.now() - startMs;
  logger.info('ingest-congress complete', {
    durationMs,
    members: memberStats,
    bills: billStats,
    senateVotes: senateVoteStats,
    houseVotes: houseVoteStats,
  });

  // ── Audit: run complete ────────────────────────────────────────────────────
  await insertIngestionEvent(pool, {
    event_type: 'run_complete',
    source: 'ingest-congress',
    data: {
      durationMs,
      members: memberStats,
      bills: billStats,
      senateVotes: senateVoteStats,
      houseVotes: houseVoteStats,
    },
  });

  await closePool();
}

main().catch((err) => {
  console.error('[ingest-congress] Fatal error:', err);
  process.exit(1);
});
