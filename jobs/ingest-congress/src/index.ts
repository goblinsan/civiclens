/**
 * index.ts — CivReveal Congress ingestion pipeline
 *
 * Pulls official government data from api.congress.gov (members, bills, House
 * roll-call votes) and Senate.gov (Senate roll-call votes), normalises it, and
 * upserts it into the database.
 *
 * Environment variables:
 *   CONGRESS_API_KEY   (required) – api.congress.gov API key
 *   DATABASE_URL       (required) – PostgreSQL connection string
 *   CONGRESS           (optional) – congress number to sync, default 119
 *   SESSION            (optional) – restrict votes to one session (1 or 2);
 *                                   default: every session up to the current one
 *   INGEST_STEPS       (optional) – comma list of members,bills,senate,house;
 *                                   default all. CONGRESS_API_KEY is only
 *                                   required when members, bills or house run.
 *   BOT_SIGNING_KEY    (optional) – Ed25519 private key (PKCS#8 PEM). When set,
 *                                   senate.gov requests carry Web Bot Auth
 *                                   signatures verifiable against the key
 *                                   directory at BOT_SIGNATURE_AGENT.
 *   BOT_SIGNATURE_AGENT (optional) – origin serving the key directory,
 *                                   default https://civreveal.org
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
  currentSessionFor,
} from './normalize.js';
import { deriveTags, isKnownPolicyArea } from './tagging.js';
import { parseIngestSteps, stepsNeedApiKey } from './steps.js';
import { createBotSigner } from './http-signature.js';
import {
  upsertPolitician,
  upsertBill,
  upsertVote,
  upsertVoteRecords,
  loadPoliticianIdMap,
  replaceDerivedBillTags,
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
  CONGRESS_API_KEY: z.string().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CONGRESS: z.coerce.number().int().positive().default(119),
  SESSION: z.coerce.number().int().min(1).max(2).optional(),
  SYNC_SINCE: z.string().optional(),
  MAX_BILLS: z.coerce.number().int().nonnegative().default(0),
  MAX_VOTES: z.coerce.number().int().nonnegative().default(50),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  INGEST_STEPS: z.string().optional(),
  BOT_SIGNING_KEY: z.string().optional(),
  BOT_SIGNATURE_AGENT: z.string().url().default('https://civreveal.org'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;

let steps: ReturnType<typeof parseIngestSteps>;
try {
  steps = parseIngestSteps(env.INGEST_STEPS);
} catch (err) {
  console.error('❌', String(err));
  process.exit(1);
}
if (stepsNeedApiKey(steps) && !env.CONGRESS_API_KEY) {
  console.error('❌ CONGRESS_API_KEY is required when the members, bills or house steps run');
  process.exit(1);
}

let botSigner: ReturnType<typeof createBotSigner> | undefined;
if (env.BOT_SIGNING_KEY) {
  try {
    botSigner = createBotSigner(env.BOT_SIGNING_KEY);
  } catch (err) {
    console.error('❌ BOT_SIGNING_KEY is not a valid Ed25519 PKCS#8 PEM key:', String(err));
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingestion sub-steps
// ─────────────────────────────────────────────────────────────────────────────

interface IngestStats {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

interface BillIngestStats extends IngestStats {
  /** Bills that received at least one derived policy tag. */
  tagged: number;
  /** Bills whose official classification mapped to no tag (they won't affect scores). */
  untagged: number;
  /** Policy area terms seen that are not in the controlled CRS list — worth a look. */
  unknownPolicyAreas: string[];
}

const emptyStats = (): IngestStats => ({ inserted: 0, updated: 0, skipped: 0, failed: 0 });

const addStats = (a: IngestStats, b: IngestStats): IngestStats => ({
  inserted: a.inserted + b.inserted,
  updated: a.updated + b.updated,
  skipped: a.skipped + b.skipped,
  failed: a.failed + b.failed,
});

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
 *
 * After each upsert the bill's policy tags are re-derived from its official
 * CRS classification (see tagging.ts / docs/bill-tagging.md). Manual tags are
 * preserved.
 */
async function ingestBills(
  pool: DbPool,
  client: CongressClient,
  logger: Logger,
  congress: number,
  options: { updatedSince?: string | undefined; maxRecords?: number | undefined } = {},
): Promise<BillIngestStats> {
  const stats: BillIngestStats = { ...emptyStats(), tagged: 0, untagged: 0, unknownPolicyAreas: [] };
  const unknownPolicyAreas = new Set<string>();

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
      const billId = await upsertBill(pool, bill, sponsorId);

      // ── Derive policy tags from the official classification ───────────────
      if (bill.policyArea && !isKnownPolicyArea(bill.policyArea)) {
        unknownPolicyAreas.add(bill.policyArea);
      }
      const derivedTags = deriveTags({ policyArea: bill.policyArea, subjects: bill.subjects });
      await replaceDerivedBillTags(pool, billId, derivedTags);
      if (derivedTags.length > 0) stats.tagged++;
      else stats.untagged++;

      logger.debug('bill tagged', {
        billType: bill.billType,
        billNumber: bill.billNumber,
        policyArea: bill.policyArea,
        tags: derivedTags.map((t) => `${t.tag}<-${t.source}:${t.matchedOn}`),
      });

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

  stats.unknownPolicyAreas = [...unknownPolicyAreas].sort();
  if (stats.unknownPolicyAreas.length > 0) {
    logger.warn('policy area terms outside the known CRS list — review tagging.ts', {
      unknownPolicyAreas: stats.unknownPolicyAreas,
    });
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
  const politicianIds = await loadPoliticianIdMap(pool);

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

      const { written, unknownVoters } = await upsertVoteRecords(pool, voteId, records, politicianIds);

      if (existingVoteId) stats.updated++;
      else stats.inserted++;

      logger.debug('senate vote upserted', {
        sourceId: event.sourceId,
        recordsWritten: written,
        unknownVoters,
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
 * Ingest House roll-call votes from the Congress.gov house-vote endpoint.
 */
async function ingestHouseVotes(
  pool: DbPool,
  client: CongressClient,
  logger: Logger,
  congress: number,
  session: number,
  options: { maxVotes?: number | undefined } = {},
): Promise<IngestStats> {
  const stats: IngestStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  const events = await client.fetchHouseVotes(congress, session, {
    ...(options.maxVotes !== undefined && { maxVotes: options.maxVotes }),
  });
  logger.info('house votes fetched', { session, count: events.length });
  const politicianIds = await loadPoliticianIdMap(pool);

  for (const event of events) {
    try {
      const { vote, records } = normalizeVoteEvent(event);

      let billId: string | null = null;
      if (vote.billCongress && vote.billType && vote.billNumber) {
        billId = await findBillId(pool, vote.billCongress, vote.billType, vote.billNumber);
      }

      const existingVoteId = await findVoteId(pool, event.sourceId);
      await saveRawPayload(pool, 'congress.gov', event.sourceId, event);
      const voteId = await upsertVote(pool, vote, billId);

      const { written, unknownVoters } = await upsertVoteRecords(pool, voteId, records, politicianIds);

      if (existingVoteId) stats.updated++;
      else stats.inserted++;

      logger.debug('house vote upserted', {
        sourceId: event.sourceId,
        recordsWritten: written,
        unknownVoters,
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

  // Votes are walked most-recent session first. MAX_VOTES is a per-chamber
  // budget of most-recent votes; a full backfill (MAX_VOTES=0) covers every
  // session of the congress.
  const latestSession = env.SESSION ?? currentSessionFor(env.CONGRESS);
  const sessions = env.SESSION ? [env.SESSION] : latestSession === 2 ? [2, 1] : [1];

  baseLogger.info('ingest-congress starting', {
    congress: env.CONGRESS,
    steps: [...steps],
    sessions,
    botSigning: botSigner ? { keyid: botSigner.keyid, signatureAgent: env.BOT_SIGNATURE_AGENT } : null,
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
      steps: [...steps],
      sessions,
      syncSince: env.SYNC_SINCE ?? null,
      maxBills: env.MAX_BILLS,
      maxVotes: env.MAX_VOTES,
    },
  });

  // Bind jobId to all subsequent log entries for full run correlation.
  const logger = baseLogger.child({ jobId });
  const congressClient = createCongressClient(env.CONGRESS_API_KEY ?? '', logger);
  const voteClient = createVoteClient(logger, {
    signer: botSigner,
    signatureAgent: env.BOT_SIGNATURE_AGENT,
  });

  let memberStats: IngestStats = emptyStats();
  let billStats: BillIngestStats = { ...emptyStats(), tagged: 0, untagged: 0, unknownPolicyAreas: [] };
  let senateVoteStats: IngestStats = emptyStats();
  let houseVoteStats: IngestStats = emptyStats();

  // ── 1. Ingest members ─────────────────────────────────────────────────────
  if (steps.has('members')) {
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
  } else {
    logger.info('step 1/4: members skipped (INGEST_STEPS)');
  }

  // ── 2. Ingest bills ───────────────────────────────────────────────────────
  if (steps.has('bills')) {
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
  } else {
    logger.info('step 2/4: bills skipped (INGEST_STEPS)');
  }

  // ── 3. Ingest Senate votes ────────────────────────────────────────────────
  if (steps.has('senate')) {
    try {
      logger.info('step 3/4: ingesting senate votes', { congress: env.CONGRESS, sessions });
      let remaining = env.MAX_VOTES;
      for (const session of sessions) {
        if (env.MAX_VOTES > 0 && remaining <= 0) break;
        const options: { maxVotes?: number } = {};
        if (env.MAX_VOTES > 0) options.maxVotes = remaining;
        const stats = await ingestSenateVotes(pool, voteClient, logger, env.CONGRESS, session, options);
        senateVoteStats = addStats(senateVoteStats, stats);
        remaining -= stats.inserted + stats.updated + stats.failed;
      }
      logger.info('senate votes ingested', { ...senateVoteStats });
    } catch (err) {
      logger.error('senate vote ingestion failed', { err: String(err) });
      await insertIngestionEvent(pool, {
        event_type: 'fetch_failure',
        source: 'ingest-congress',
        entity_type: 'senate_votes',
        data: { congress: env.CONGRESS, sessions, error: String(err) },
      });
    }
  } else {
    logger.info('step 3/4: senate skipped (INGEST_STEPS)');
  }

  // ── 4. Ingest House votes ─────────────────────────────────────────────────
  if (steps.has('house')) {
    try {
      logger.info('step 4/4: ingesting house votes', { congress: env.CONGRESS, sessions });
      let remaining = env.MAX_VOTES;
      for (const session of sessions) {
        if (env.MAX_VOTES > 0 && remaining <= 0) break;
        const options: { maxVotes?: number } = {};
        if (env.MAX_VOTES > 0) options.maxVotes = remaining;
        const stats = await ingestHouseVotes(pool, congressClient, logger, env.CONGRESS, session, options);
        houseVoteStats = addStats(houseVoteStats, stats);
        remaining -= stats.inserted + stats.updated + stats.failed;
      }
      logger.info('house votes ingested', { ...houseVoteStats });
    } catch (err) {
      logger.error('house vote ingestion failed', { err: String(err) });
      await insertIngestionEvent(pool, {
        event_type: 'fetch_failure',
        source: 'ingest-congress',
        entity_type: 'house_votes',
        data: { congress: env.CONGRESS, sessions, error: String(err) },
      });
    }
  } else {
    logger.info('step 4/4: house skipped (INGEST_STEPS)');
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
