/**
 * vote-client.ts
 *
 * Fetches roll-call vote data from the official Senate.gov and House Clerk
 * XML feeds and converts them into structured CongressVoteEvent objects.
 *
 * Senate feed: https://www.senate.gov/legislative/LIS/roll_call_lists/
 * House feed:  https://clerk.house.gov/evs/{year}/
 */

import { XMLParser } from 'fast-xml-parser';
import type { Logger } from './logger.js';
import type { CongressVoteEvent, CongressVoteMember } from './normalize.js';
import { normalizeVoteValue } from './normalize.js';

const SENATE_BASE = 'https://www.senate.gov/legislative/LIS';
const HOUSE_BASE = 'https://clerk.house.gov/evs';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, logger: Logger, maxRetries = 3): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
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
  isArray: (tagName) => ['vote', 'member', 'recorded-vote'].includes(tagName),
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
// House vote feed
// ─────────────────────────────────────────────────────────────────────────────

interface HouseRollCallVote {
  'vote-metadata'?: {
    congress?: number | string;
    session?: number | string;
    'vote-number'?: number | string;
    date?: string;
    'action-date'?: string;
    'legis-num'?: string;
    'vote-question'?: string;
    'vote-result'?: string;
  };
  'vote-data'?: {
    'recorded-vote'?: Array<{
      legislator?: {
        '#text'?: string;
        '@_name-id'?: string;
        '@_party'?: string;
        '@_state'?: string;
      };
      vote?: string;
    }>;
  };
}

/**
 * Fetch the list of roll-call vote numbers for House votes in a given year.
 */
async function fetchHouseVoteList(year: number, logger: Logger): Promise<number[]> {
  const url = `${HOUSE_BASE}/${year}/ROLLCALL.xml`;
  logger.debug('fetching house vote list', { year, url });

  const xml = await fetchText(url, logger);
  const parsed = xmlParser.parse(xml) as {
    evs?: { vote?: Array<{ rollnumber?: number | string }> };
  };

  const votes = parsed.evs?.vote ?? [];
  return votes
    .map((v) => Number(v.rollnumber))
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);
}

/**
 * Fetch the full detail for a single House roll-call vote.
 */
async function fetchHouseVoteDetail(
  year: number,
  congress: number,
  rollCallNumber: number,
  logger: Logger,
): Promise<CongressVoteEvent | null> {
  const paddedNum = String(rollCallNumber).padStart(3, '0');
  const url = `${HOUSE_BASE}/${year}/roll${paddedNum}.xml`;
  logger.debug('fetching house vote detail', { year, rollCallNumber, url });

  let xml: string;
  try {
    xml = await fetchText(url, logger);
  } catch (err) {
    logger.warn('house vote detail not found', { rollCallNumber, err: String(err) });
    return null;
  }

  const parsed = xmlParser.parse(xml) as { 'roll-call-vote'?: HouseRollCallVote };
  const detail = parsed['roll-call-vote'];
  if (!detail) return null;

  const meta = detail['vote-metadata'];
  const session = Number(meta?.session ?? 1);

  const members: CongressVoteMember[] = (detail['vote-data']?.['recorded-vote'] ?? []).map((rv) => ({
    bioguideId: rv.legislator?.['@_name-id'],
    party: rv.legislator?.['@_party'],
    state: rv.legislator?.['@_state'],
    votePosition: rv.vote ?? 'Not Voting',
  }));

  // Parse bill identifier from legis-num, e.g. "H R 1" → { type: 'HR', number: '1' }
  let billIdentifier: CongressVoteEvent['billIdentifier'];
  const legisNum = meta?.['legis-num'];
  if (legisNum) {
    const normalized = String(legisNum).toUpperCase().replace(/\s+/g, '');
    const match = normalized.match(/^(HR|S|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES)(\d+)$/);
    if (match?.[1] && match?.[2]) {
      billIdentifier = { type: match[1], number: match[2], congress };
    }
  }

  const resultText = meta?.['vote-result'] ?? '';
  const yeaCount = members.filter((m) => normalizeVoteValue(m.votePosition) === 'yea').length;
  const nayCount = members.filter((m) => normalizeVoteValue(m.votePosition) === 'nay').length;
  const abstainCount = members.filter((m) => normalizeVoteValue(m.votePosition) === 'abstain').length;
  const notVotingCount = members.filter((m) => normalizeVoteValue(m.votePosition) === 'not-voting').length;

  return {
    sourceId: `house-${congress}-${year}-${rollCallNumber}`,
    chamber: 'house',
    congress,
    session,
    rollCallNumber,
    voteDate: meta?.['action-date'] ?? meta?.date ?? '',
    question: meta?.['vote-question'],
    result: resultText,
    yeaCount,
    nayCount,
    abstainCount,
    notVotingCount,
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
  /** Maximum number of vote details to fetch per chamber. */
  maxVotes?: number | undefined;
  /** Delay between detail requests (ms). */
  requestDelayMs?: number | undefined;
}

export function createVoteClient(logger: Logger) {
  /**
   * Fetch Senate roll-call votes for the given congress and session.
   * Returns vote events with member-level positions.
   */
  async function fetchSenateVotes(
    congress: number,
    session: number,
    options: FetchVotesOptions = {},
  ): Promise<CongressVoteEvent[]> {
    const { fromRollCallNumber = 1, maxVotes = 0, requestDelayMs = 300 } = options;
    const events: CongressVoteEvent[] = [];

    let allNumbers: number[];
    try {
      allNumbers = await fetchSenateVoteList(congress, session, logger);
    } catch (err) {
      logger.error('failed to fetch senate vote list', { congress, session, err: String(err) });
      return events;
    }

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

  /**
   * Fetch House roll-call votes for the given congress and year.
   */
  async function fetchHouseVotes(
    congress: number,
    year: number,
    options: FetchVotesOptions = {},
  ): Promise<CongressVoteEvent[]> {
    const { fromRollCallNumber = 1, maxVotes = 0, requestDelayMs = 300 } = options;
    const events: CongressVoteEvent[] = [];

    let allNumbers: number[];
    try {
      allNumbers = await fetchHouseVoteList(year, logger);
    } catch (err) {
      logger.error('failed to fetch house vote list', { year, err: String(err) });
      return events;
    }

    const numbers = allNumbers.filter((n) => n >= fromRollCallNumber);
    const toFetch = maxVotes > 0 ? numbers.slice(-maxVotes) : numbers;

    logger.info('fetching house vote details', {
      congress,
      year,
      total: numbers.length,
      fetching: toFetch.length,
    });

    for (const num of toFetch) {
      const event = await fetchHouseVoteDetail(year, congress, num, logger);
      if (event) events.push(event);
      await sleep(requestDelayMs);
    }

    return events;
  }

  return { fetchSenateVotes, fetchHouseVotes };
}

export type VoteClient = ReturnType<typeof createVoteClient>;
