/**
 * vote-client.ts
 *
 * Fetches Senate roll-call vote data from the official Senate.gov LIS XML
 * feed and converts it into structured CongressVoteEvent objects.
 *
 * Senate feed: https://www.senate.gov/legislative/LIS/roll_call_lists/
 *
 * House roll-call votes come from the Congress.gov API instead
 * (see congress-client.ts → fetchHouseVotes); the House Clerk XML index this
 * module once scraped does not exist, and Congress.gov carries every member's
 * position with the bill linkage already resolved.
 *
 * Known limitation: senate.gov returns HTTP 403 to requests from cloud
 * provider IP ranges (including GitHub-hosted runners) regardless of
 * User-Agent, and Congress.gov has no Senate vote endpoint yet. A list fetch
 * failure is therefore thrown, not swallowed, so the run records a
 * `fetch_failure` event and the gap is visible.
 */

import { XMLParser } from 'fast-xml-parser';
import type { Logger } from './logger.js';
import type { CongressVoteEvent, CongressVoteMember } from './normalize.js';

const SENATE_BASE = 'https://www.senate.gov/legislative/LIS';

/** Identify ourselves honestly to the upstream server. */
const USER_AGENT = 'CivReveal/0.1 (civic transparency project; +https://github.com/goblinsan/civiclens)';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, logger: Logger, maxRetries = 3): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' } });
      if (response.ok) return await response.text();
      if (response.status === 404) throw new Error(`404 Not Found: ${url}`);
      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn('vote feed fetch failed, will retry', { url, status: response.status, attempt });
        if (attempt < maxRetries) { await sleep(delay); continue; }
      }
      throw new Error(`HTTP ${response.status}: ${url}`);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName) => ['vote', 'member'].includes(tagName),
});

// ─────────────────────────────────────────────────────────────────────────────
// Senate vote feed
// ─────────────────────────────────────────────────────────────────────────────

interface SenateVoteMenuItem {
  vote_number?: number | string;
  vote_date?: string;
  question?: string;
  result?: string;
  title?: string;
  issue?: string;
  vote_count?: {
    yeas?: number;
    nays?: number;
    absent?: number;
    present?: number;
  };
}

interface SenateVoteDetail {
  congress?: number;
  session?: number;
  vote_number?: number | string;
  vote_date?: string;
  question?: string;
  vote_result_text?: string;
  vote_result?: string;
  document?: {
    document_congress?: number;
    document_type?: string;
    document_number?: string;
  };
  count?: {
    yeas?: number;
    nays?: number;
    absent?: number;
    present?: number;
  };
  members?: {
    member?: Array<{
      bioguide_id?: string;
      lis_member_id?: string;
      first_name?: string;
      last_name?: string;
      party?: string;
      state?: string;
      vote_cast?: string;
    }>;
  };
}

/**
 * Fetch the list of roll-call vote numbers for a given Congress session.
 * Returns vote numbers sorted ascending (oldest first).
 */
async function fetchSenateVoteList(
  congress: number,
  session: number,
  logger: Logger,
): Promise<number[]> {
  const url = `${SENATE_BASE}/roll_call_lists/vote_menu_${congress}_${session}.xml`;
  logger.debug('fetching senate vote list', { congress, session, url });

  const xml = await fetchText(url, logger);
  const parsed = xmlParser.parse(xml) as {
    vote_summary?: { votes?: { vote?: SenateVoteMenuItem[] } };
  };

  const votes = parsed.vote_summary?.votes?.vote ?? [];
  return votes
    .map((v) => Number(v.vote_number))
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);
}

/**
 * Fetch the full detail for a single Senate roll-call vote.
 */
async function fetchSenateVoteDetail(
  congress: number,
  session: number,
  rollCallNumber: number,
  logger: Logger,
): Promise<CongressVoteEvent | null> {
  const paddedNum = String(rollCallNumber).padStart(5, '0');
  const url =
    `${SENATE_BASE}/roll_call_votes/vote${congress}${session}` +
    `/vote_${congress}_${session}_${paddedNum}.xml`;
  logger.debug('fetching senate vote detail', { congress, session, rollCallNumber, url });

  let xml: string;
  try {
    xml = await fetchText(url, logger);
  } catch (err) {
    logger.warn('senate vote detail not found', { rollCallNumber, err: String(err) });
    return null;
  }

  const parsed = xmlParser.parse(xml) as { roll_call_vote?: SenateVoteDetail };
  const detail = parsed.roll_call_vote;
  if (!detail) return null;

  const yeaCount = Number(detail.count?.yeas ?? 0);
  const nayCount = Number(detail.count?.nays ?? 0);
  const absentCount = Number(detail.count?.absent ?? 0);
  const presentCount = Number(detail.count?.present ?? 0);

  const members: CongressVoteMember[] = (detail.members?.member ?? []).map((m) => ({
    bioguideId: m.bioguide_id ?? m.lis_member_id,
    firstName: m.first_name,
    lastName: m.last_name,
    party: m.party,
    state: m.state,
    votePosition: m.vote_cast ?? 'Not Voting',
  }));

  let billIdentifier: CongressVoteEvent['billIdentifier'];
  const doc = detail.document;
  if (doc?.document_type && doc.document_number) {
    const docType = String(doc.document_type).toUpperCase().replace(/\s+/g, '');
    billIdentifier = {
      type: docType,
      number: String(doc.document_number),
      congress: Number(doc.document_congress ?? congress),
    };
  }

  return {
    sourceId: `senate-${congress}-${session}-${rollCallNumber}`,
    chamber: 'senate',
    congress,
    session,
    rollCallNumber,
    voteDate: detail.vote_date ?? '',
    question: detail.question,
    result: detail.vote_result_text ?? detail.vote_result ?? '',
    yeaCount,
    nayCount,
    abstainCount: presentCount,
    notVotingCount: absentCount,
    billIdentifier,
    members,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public vote client factory
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchVotesOptions {
  /** Only fetch vote numbers >= this value (for incremental sync). */
  fromRollCallNumber?: number | undefined;
  /** Maximum number of vote details to fetch. */
  maxVotes?: number | undefined;
  /** Delay between detail requests (ms). */
  requestDelayMs?: number | undefined;
}

export function createVoteClient(logger: Logger) {
  /**
   * Fetch Senate roll-call votes for the given congress and session.
   * Returns vote events with member-level positions.
   *
   * Throws when the vote list cannot be fetched (e.g. senate.gov refusing the
   * request) so the caller can record the failure instead of reporting an
   * empty chamber as success.
   */
  async function fetchSenateVotes(
    congress: number,
    session: number,
    options: FetchVotesOptions = {},
  ): Promise<CongressVoteEvent[]> {
    const { fromRollCallNumber = 1, maxVotes = 0, requestDelayMs = 300 } = options;
    const events: CongressVoteEvent[] = [];

    const allNumbers = await fetchSenateVoteList(congress, session, logger);

    const numbers = allNumbers.filter((n) => n >= fromRollCallNumber);
    const toFetch = maxVotes > 0 ? numbers.slice(-maxVotes) : numbers;

    logger.info('fetching senate vote details', {
      congress,
      session,
      total: numbers.length,
      fetching: toFetch.length,
    });

    for (const num of toFetch) {
      const event = await fetchSenateVoteDetail(congress, session, num, logger);
      if (event) events.push(event);
      await sleep(requestDelayMs);
    }

    return events;
  }

  return { fetchSenateVotes };
}

export type VoteClient = ReturnType<typeof createVoteClient>;
