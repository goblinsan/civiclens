/** Typed API client for the CivReveal backend. */

const BASE = '/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const str = sp.toString();
  return str ? `?${str}` : '';
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BillSummary {
  id: string;
  congress: number;
  bill_type: string;
  bill_number: string;
  title: string;
  summary: string | null;
  status: string;
  sponsor_id: string;
  sponsor_first_name: string;
  sponsor_last_name: string;
  introduced_at: string;
  updated_at: string;
  tags: string[];
}

export interface PoliticianSummary {
  id: string;
  bioguide_id: string;
  first_name: string;
  last_name: string;
  party: string;
  state: string;
  chamber: 'senate' | 'house';
  district: number | null;
  image_url: string | null;
  website: string | null;
}

export interface Vote {
  id: string;
  bill_id: string | null;
  chamber: 'senate' | 'house';
  vote_date: string;
  result: 'passed' | 'failed' | 'tie';
  yea_count: number;
  nay_count: number;
  abstain_count: number;
  not_voting_count: number;
}

export interface VoteRecord {
  id: string;
  vote_id: string;
  politician_id: string;
  value: 'yea' | 'nay' | 'abstain' | 'not-voting';
  politician_first_name: string;
  politician_last_name: string;
  politician_party: string;
  politician_state: string;
  politician_chamber: 'senate' | 'house';
}

export interface PoliticianVoteRecord {
  id: string;
  vote_id: string;
  politician_id: string;
  value: 'yea' | 'nay' | 'abstain' | 'not-voting';
  vote_date: string;
  chamber: 'senate' | 'house';
  bill_id: string | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export type SentimentValue = 'support' | 'oppose' | 'neutral';

export interface SentimentCounts {
  support: number;
  oppose: number;
  neutral: number;
  total: number;
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export function listBills(params: {
  page?: number;
  limit?: number;
  status?: string;
  tag?: string;
  congress?: number;
  q?: string;
}): Promise<Paginated<BillSummary>> {
  return fetchJson(`${BASE}/bills${buildQuery(params)}`);
}

export function getBill(id: string): Promise<BillSummary> {
  return fetchJson(`${BASE}/bills/${id}`);
}

export function getBillVotes(id: string): Promise<Vote[]> {
  return fetchJson(`${BASE}/bills/${id}/votes`);
}

// ─── Sentiments ───────────────────────────────────────────────────────────────

export function getBillSentiments(billId: string): Promise<SentimentCounts> {
  return fetchJson(`${BASE}/bills/${billId}/sentiments`);
}

export function submitSentiment(body: {
  billId: string;
  sessionId: string;
  sentiment: SentimentValue;
  turnstileToken?: string;
}): Promise<{ id: string; sentiment: SentimentValue }> {
  const { billId, ...rest } = body;
  return fetchJson(`${BASE}/bills/${billId}/sentiments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rest),
  });
}

// ─── Votes ────────────────────────────────────────────────────────────────────

export function getVoteRecords(voteId: string): Promise<VoteRecord[]> {
  return fetchJson(`${BASE}/votes/${voteId}/records`);
}

// ─── Politicians ──────────────────────────────────────────────────────────────

export function listPoliticians(params: {
  page?: number;
  limit?: number;
  chamber?: string;
  party?: string;
  state?: string;
}): Promise<Paginated<PoliticianSummary>> {
  return fetchJson(`${BASE}/politicians${buildQuery(params)}`);
}

export function getPolitician(id: string): Promise<PoliticianSummary> {
  return fetchJson(`${BASE}/politicians/${id}`);
}

export function getPoliticianVotes(
  id: string,
  params: { page?: number; limit?: number } = {},
): Promise<Paginated<PoliticianVoteRecord>> {
  return fetchJson(`${BASE}/politicians/${id}/votes${buildQuery(params)}`);
}

// ─── Questionnaire ────────────────────────────────────────────────────────────

export interface PolicyQuestion {
  id: string;
  slug: string;
  label: string;
}

export type Stance =
  | 'strongly-support'
  | 'support'
  | 'neutral'
  | 'oppose'
  | 'strongly-oppose';

export interface MatchResult {
  id: string;
  profile_id: string;
  politician_id: string;
  /** NUMERIC from pg – kept as string to avoid precision loss. */
  score: string;
  /** Per-tag alignment scores (0–100) plus `_total_votes` count. */
  breakdown: Record<string, number>;
  computed_at: string;
  first_name: string;
  last_name: string;
  party: string;
  state: string;
  chamber: 'senate' | 'house';
  image_url: string | null;
  bioguide_id: string;
  total_votes: number;
}

export function getQuestions(): Promise<PolicyQuestion[]> {
  return fetchJson(`${BASE}/questionnaire/questions`);
}

export function submitQuestionnaire(body: {
  sessionId: string;
  responses: Array<{ tag: string; stance: Stance }>;
}): Promise<{ sessionId: string; profileId: string }> {
  return fetchJson(`${BASE}/questionnaire/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getMatches(sessionId: string): Promise<MatchResult[]> {
  return fetchJson(
    `${BASE}/questionnaire/matches${buildQuery({ sessionId })}`,
  );
}
