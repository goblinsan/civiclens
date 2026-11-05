/**
 * congress-client.ts
 *
 * HTTP client for the Congress.gov REST API v3.
 * Handles pagination, retries with exponential back-off, and rate-limiting.
 *
 * API docs: https://api.congress.gov
 */

import type { Logger } from './logger.js';
import { normalizeHouseVoteApi } from './normalize.js';
import { USER_AGENT } from './user-agent.js';
import type {
  CongressBillSummary,
  CongressMemberSummary,
  CongressVoteEvent,
  HouseVoteApiItem,
  HouseVoteApiMemberVote,
} from './normalize.js';

const BASE_URL = 'https://api.congress.gov/v3';
/** Delay between paginated requests to stay within rate limits (ms). */
const REQUEST_DELAY_MS = 200;
/** Maximum number of records per page (API maximum). */
const PAGE_LIMIT = 250;
/** Abort any single request that has not completed within this time. */
const REQUEST_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a JSON document with exponential back-off on transient failures.
 *
 * The body is consumed here, inside the request's timeout window. Returning
 * the Response and reading it later is unsafe: the AbortSignal keeps running
 * after the headers arrive, and if the body is still unread when it fires
 * (e.g. while a sibling request in a Promise.all is slow) the stream is
 * cancelled and `.json()` fails with "Body is unusable". A failed body read
 * is retried like any other transient error.
 */
async function fetchJson<T>(
  url: string,
  logger: Logger,
  maxRetries = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) return (await response.json()) as T;

      // Retry on rate-limit or server-side errors
      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn('fetch failed, will retry', {
          url: redact(url),
          status: response.status,
          attempt,
          retryAfterMs: delay,
        });
        if (attempt < maxRetries) {
          await sleep(delay);
          continue;
        }
      }

      throw new Error(`HTTP ${response.status} ${response.statusText}: ${redact(url)}`);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn('fetch error, will retry', {
          url: redact(url),
          err: String(err),
          attempt,
          retryAfterMs: delay,
        });
        await sleep(delay);
      }
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${redact(url)}`);
}

/** Hide the API key in anything that reaches the log. */
function redact(url: string): string {
  return url.replace(/api_key=[^&]+/, 'api_key=***');
}

/** Append ?format=json&api_key=… and optional extra params. */
function buildUrl(path: string, apiKey: string, params: Record<string, string> = {}): string {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API types
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchBillsOptions {
  /** Filter to bills updated at or after this ISO-8601 datetime string. */
  updatedSince?: string | undefined;
  /** Maximum total records to fetch (0 = no limit). */
  maxRecords?: number | undefined;
}

export interface FetchMembersOptions {
  /** Only return current members (default: true). */
  currentMember?: boolean | undefined;
  /** Maximum total records to fetch (0 = no limit). */
  maxRecords?: number | undefined;
}

export interface FetchHouseVotesOptions {
  /** Keep only the N most recent roll-calls of the session (0 = all). */
  maxVotes?: number | undefined;
  /**
   * Return true to skip fetching a vote's member positions (e.g. because the
   * stored copy already matches the item's updateDate). Skipped votes are not
   * returned.
   */
  skip?: ((item: HouseVoteApiItem) => boolean) | undefined;
  /** Parallel member-position requests (default 4). */
  concurrency?: number | undefined;
}

export interface BillDetailResult extends CongressBillSummary {
  summaryText: string | null;
  legislativeSubjects: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Congress.gov raw response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface CongressPagination {
  count?: number;
  next?: string;
  offset?: number;
  total?: number;
}

interface BillListResponse {
  bills?: CongressBillSummary[];
  pagination?: CongressPagination;
}

interface BillDetailResponse {
  bill?: CongressBillSummary & {
    introducedDate?: string;
    sponsors?: Array<{
      bioguideId?: string;
      firstName?: string;
      lastName?: string;
      fullName?: string;
      party?: string;
      state?: string;
      district?: number;
    }>;
  };
}

interface BillSummariesResponse {
  summaries?: Array<{
    text?: string;
    actionDate?: string;
    updateDate?: string;
    versionCode?: string;
  }>;
}

interface BillSubjectsResponse {
  subjects?: {
    legislativeSubjects?: Array<{ name?: string }>;
    policyArea?: { name?: string };
  };
}

interface HouseVoteListResponse {
  houseRollCallVotes?: HouseVoteApiItem[];
  pagination?: CongressPagination;
}

/**
 * GET /house-vote/{congress}/{session}/{roll}/members. Besides the member
 * positions it repeats the vote's own fields, and it is the only place the
 * question put to the chamber ("On Passage", "On Motion to Recommit"…) is
 * published; the list endpoint carries only voteType ("Yea-and-Nay",
 * "Recorded Vote"), which is not a question.
 */
interface HouseVoteMembersResponse {
  houseRollCallVoteMemberVotes?: {
    voteQuestion?: string;
    voteType?: string;
    result?: string;
    results?: HouseVoteApiMemberVote[];
  };
}

interface MemberListResponse {
  members?: CongressMemberSummary[];
  pagination?: CongressPagination;
}

interface MemberDetailResponse {
  member?: CongressMemberSummary & {
    firstName?: string;
    lastName?: string;
    officialWebsiteUrl?: string;
    directOrderName?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Client factory
// ─────────────────────────────────────────────────────────────────────────────

export function createCongressClient(apiKey: string, logger: Logger) {
  /**
   * Fetch all bills for a given congress, optionally filtered by update date.
   * Automatically pages through the full result set.
   */
  async function fetchBills(
    congress: number,
    options: FetchBillsOptions = {},
  ): Promise<CongressBillSummary[]> {
    const { updatedSince, maxRecords = 0 } = options;
    const results: CongressBillSummary[] = [];
    let offset = 0;

    logger.info('fetching bills', { congress, updatedSince });

    while (true) {
      const params: Record<string, string> = {
        limit: String(PAGE_LIMIT),
        offset: String(offset),
        sort: 'updateDate+desc',
      };
      if (updatedSince) {
        params['fromDateTime'] = updatedSince;
      }

      const url = buildUrl(`/bill/${congress}`, apiKey, params);
      logger.debug('GET bills page', { url: redact(url), offset });

      const data = await fetchJson<BillListResponse>(url, logger);

      const page = data.bills ?? [];
      results.push(...page);

      logger.debug('bills page received', { count: page.length, total: results.length });

      if (page.length < PAGE_LIMIT) break;
      if (maxRecords > 0 && results.length >= maxRecords) break;

      offset += PAGE_LIMIT;
      await sleep(REQUEST_DELAY_MS);
    }

    return maxRecords > 0 ? results.slice(0, maxRecords) : results;
  }

  /**
   * Fetch the full detail for a single bill, including sponsor, summary text,
   * and the official CRS classification (policy area + legislative subjects).
   *
   * Three requests run in parallel: detail, summaries, subjects. The summaries
   * and subjects calls are best-effort — if either fails the bill is still
   * returned, just without that data.
   */
  async function fetchBillDetail(
    congress: number,
    billType: string,
    billNumber: string,
  ): Promise<BillDetailResult | null> {
    const type = billType.toLowerCase();
    const base = `/bill/${congress}/${type}/${billNumber}`;
    const detailUrl = buildUrl(base, apiKey);
    const summariesUrl = buildUrl(`${base}/summaries`, apiKey);
    const subjectsUrl = buildUrl(`${base}/subjects`, apiKey);

    logger.debug('GET bill detail', { congress, billType, billNumber });

    const [detailData, summaryData, subjectsData] = await Promise.all([
      fetchJson<BillDetailResponse>(detailUrl, logger),
      fetchJson<BillSummariesResponse>(summariesUrl, logger).catch(() => null),
      fetchJson<BillSubjectsResponse>(subjectsUrl, logger).catch(() => null),
    ]);

    const bill = detailData.bill;
    if (!bill) return null;

    let summaryText: string | null = null;
    if (summaryData) {
      const latest = summaryData.summaries?.[0];
      if (latest?.text) {
        // Strip HTML tags from summary text
        summaryText = latest.text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
      }
    }

    const legislativeSubjects: string[] = [];
    let policyArea = bill.policyArea;
    if (subjectsData) {
      for (const item of subjectsData.subjects?.legislativeSubjects ?? []) {
        if (item.name) legislativeSubjects.push(item.name);
      }
      // The subjects endpoint also carries the policy area; use it as a fallback.
      if (!policyArea?.name && subjectsData.subjects?.policyArea?.name) {
        policyArea = { name: subjectsData.subjects.policyArea.name };
      }
    } else {
      logger.warn('bill subjects unavailable', { congress, billType, billNumber });
    }

    await sleep(REQUEST_DELAY_MS);
    return {
      ...bill,
      ...(policyArea !== undefined && { policyArea }),
      summaryText,
      legislativeSubjects,
    };
  }

  /**
   * Fetch all (current) congressional members, paging through the full result set.
   */
  async function fetchMembers(options: FetchMembersOptions = {}): Promise<CongressMemberSummary[]> {
    const { currentMember = true, maxRecords = 0 } = options;
    const results: CongressMemberSummary[] = [];
    let offset = 0;

    logger.info('fetching members', { currentMember });

    while (true) {
      const params: Record<string, string> = {
        limit: String(PAGE_LIMIT),
        offset: String(offset),
        currentMember: String(currentMember),
      };

      const url = buildUrl('/member', apiKey, params);
      logger.debug('GET members page', { url: redact(url), offset });

      const data = await fetchJson<MemberListResponse>(url, logger);

      const page = data.members ?? [];
      results.push(...page);

      logger.debug('members page received', { count: page.length, total: results.length });

      if (page.length < PAGE_LIMIT) break;
      if (maxRecords > 0 && results.length >= maxRecords) break;

      offset += PAGE_LIMIT;
      await sleep(REQUEST_DELAY_MS);
    }

    return maxRecords > 0 ? results.slice(0, maxRecords) : results;
  }

  /**
   * Fetch the full detail for a single member by bioguide ID.
   */
  async function fetchMemberDetail(bioguideId: string): Promise<CongressMemberSummary | null> {
    const url = buildUrl(`/member/${bioguideId}`, apiKey);
    logger.debug('GET member detail', { bioguideId });

    const data = await fetchJson<MemberDetailResponse>(url, logger);

    await sleep(REQUEST_DELAY_MS);
    return data.member ?? null;
  }

  /**
   * Fetch House roll-call votes for a congress session from the Congress.gov
   * house-vote endpoint, with every member's position.
   *
   * The list is paged in full, sorted most-recent-first (the API's own order
   * is not guaranteed), optionally truncated to `maxVotes`, and each vote's
   * member positions are fetched individually. A vote whose member list
   * cannot be fetched is skipped with a warning rather than failing the run.
   */
  async function fetchHouseVotes(
    congress: number,
    session: number,
    options: FetchHouseVotesOptions = {},
  ): Promise<CongressVoteEvent[]> {
    const { maxVotes = 0, skip, concurrency = 4 } = options;
    const items: HouseVoteApiItem[] = [];
    let offset = 0;

    logger.info('fetching house votes', { congress, session });

    while (true) {
      const url = buildUrl(`/house-vote/${congress}/${session}`, apiKey, {
        limit: String(PAGE_LIMIT),
        offset: String(offset),
      });
      const data = await fetchJson<HouseVoteListResponse>(url, logger);
      const page = data.houseRollCallVotes ?? [];
      items.push(...page);
      if (page.length < PAGE_LIMIT) break;
      offset += PAGE_LIMIT;
      await sleep(REQUEST_DELAY_MS);
    }

    items.sort((a, b) => b.rollCallNumber - a.rollCallNumber);
    const window = maxVotes > 0 ? items.slice(0, maxVotes) : items;
    const toFetch = skip ? window.filter((item) => !skip(item)) : window;
    logger.info('house votes listed', {
      congress,
      session,
      total: items.length,
      unchanged: window.length - toFetch.length,
      fetching: toFetch.length,
    });

    // Member positions are ~100 KB each and the API takes a few seconds per
    // call, so fetch a few in parallel. Results are collected by index so the
    // output keeps the most-recent-first order regardless of completion order.
    const events: (CongressVoteEvent | undefined)[] = new Array(toFetch.length);
    let next = 0;
    const worker = async () => {
      while (next < toFetch.length) {
        const index = next++;
        const item = toFetch[index]!;
        try {
          const membersUrl = buildUrl(
            `/house-vote/${congress}/${session}/${item.rollCallNumber}/members`,
            apiKey,
          );
          const data = await fetchJson<HouseVoteMembersResponse>(membersUrl, logger);
          const detail = data.houseRollCallVoteMemberVotes;
          events[index] = normalizeHouseVoteApi(
            { ...item, voteQuestion: detail?.voteQuestion ?? item.voteQuestion },
            detail?.results ?? [],
          );
        } catch (err) {
          logger.warn('house vote member positions unavailable, skipping', {
            congress,
            session,
            rollCallNumber: item.rollCallNumber,
            err: String(err),
          });
        }
        await sleep(REQUEST_DELAY_MS);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

    return events.filter((e): e is CongressVoteEvent => e !== undefined);
  }

  return { fetchBills, fetchBillDetail, fetchMembers, fetchMemberDetail, fetchHouseVotes };
}

export type CongressClient = ReturnType<typeof createCongressClient>;
