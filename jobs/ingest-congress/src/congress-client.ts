/**
 * congress-client.ts
 *
 * HTTP client for the Congress.gov REST API v3.
 * Handles pagination, retries with exponential back-off, and rate-limiting.
 *
 * API docs: https://api.congress.gov
 */

import type { Logger } from './logger.js';
import type {
  CongressBillSummary,
  CongressMemberSummary,
} from './normalize.js';

const BASE_URL = 'https://api.congress.gov/v3';
/** Delay between paginated requests to stay within rate limits (ms). */
const REQUEST_DELAY_MS = 200;
/** Maximum number of records per page (API maximum). */
const PAGE_LIMIT = 250;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch with exponential back-off on transient failures. */
async function fetchWithRetry(
  url: string,
  logger: Logger,
  maxRetries = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);

      if (response.ok) return response;

      // Retry on rate-limit or server-side errors
      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn('fetch failed, will retry', {
          url,
          status: response.status,
          attempt,
          retryAfterMs: delay,
        });
        if (attempt < maxRetries) {
          await sleep(delay);
          continue;
        }
      }

      throw new Error(`HTTP ${response.status} ${response.statusText}: ${url}`);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn('fetch error, will retry', {
          url,
          err: String(err),
          attempt,
          retryAfterMs: delay,
        });
        await sleep(delay);
      }
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
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

export interface BillDetailResult extends CongressBillSummary {
  summaryText: string | null;
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
      logger.debug('GET bills page', { url: url.replace(apiKey, '***'), offset });

      const response = await fetchWithRetry(url, logger);
      const data = (await response.json()) as BillListResponse;

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
   * Fetch the full detail for a single bill, including sponsor and summary text.
   */
  async function fetchBillDetail(
    congress: number,
    billType: string,
    billNumber: string,
  ): Promise<BillDetailResult | null> {
    const type = billType.toLowerCase();
    const detailUrl = buildUrl(`/bill/${congress}/${type}/${billNumber}`, apiKey);
    const summariesUrl = buildUrl(`/bill/${congress}/${type}/${billNumber}/summaries`, apiKey);

    logger.debug('GET bill detail', { congress, billType, billNumber });

    const [detailRes, summaryRes] = await Promise.all([
      fetchWithRetry(detailUrl, logger),
      fetchWithRetry(summariesUrl, logger).catch(() => null),
    ]);

    const detailData = (await detailRes.json()) as BillDetailResponse;
    const bill = detailData.bill;
    if (!bill) return null;

    let summaryText: string | null = null;
    if (summaryRes?.ok) {
      const summaryData = (await summaryRes.json()) as BillSummariesResponse;
      const latest = summaryData.summaries?.[0];
      if (latest?.text) {
        // Strip HTML tags from summary text
        summaryText = latest.text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
      }
    }

    await sleep(REQUEST_DELAY_MS);
    return { ...bill, summaryText };
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
      logger.debug('GET members page', { url: url.replace(apiKey, '***'), offset });

      const response = await fetchWithRetry(url, logger);
      const data = (await response.json()) as MemberListResponse;

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

    const response = await fetchWithRetry(url, logger);
    const data = (await response.json()) as MemberDetailResponse;

    await sleep(REQUEST_DELAY_MS);
    return data.member ?? null;
  }

  return { fetchBills, fetchBillDetail, fetchMembers, fetchMemberDetail };
}

export type CongressClient = ReturnType<typeof createCongressClient>;
