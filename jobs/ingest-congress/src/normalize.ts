/**
 * normalize.ts
 *
 * Pure, testable transformation functions that convert raw Congress.gov API
 * and XML vote-feed payloads into the canonical internal schema.
 * These functions have no side-effects and depend on no I/O.
 */

import type { BillStatus, VoteValue } from '@civreveal/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Raw API shape types (Congress.gov v3)
// ─────────────────────────────────────────────────────────────────────────────

export interface CongressMemberTerm {
  chamber?: string | undefined;
  congress?: number | undefined;
  endYear?: number | null;
  memberType?: string | undefined;
  startYear?: number | undefined;
  stateCode?: string | undefined;
  stateName?: string | undefined;
}

export interface CongressMemberSummary {
  bioguideId: string;
  depiction?: { imageUrl?: string | undefined; attribution?: string | undefined } | undefined;
  district?: number | undefined;
  name?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  directOrderName?: string | undefined;
  officialWebsiteUrl?: string | undefined;
  partyName?: string | undefined;
  state?: string | undefined;
  terms?: { item?: CongressMemberTerm[] | undefined } | undefined;
  updateDate?: string | undefined;
  /** Present on member detail responses; absent on roster lists filtered to current members. */
  currentMember?: boolean | undefined;
}

export interface CongressBillSponsor {
  bioguideId?: string | undefined;
  firstName?: string | undefined;
  fullName?: string | undefined;
  lastName?: string | undefined;
  party?: string | undefined;
  state?: string | undefined;
  district?: number | undefined;
}

export interface CongressBillSummary {
  congress: number;
  latestAction?: { actionDate?: string | undefined; text?: string | undefined } | undefined;
  number: string;
  originChamber?: string | undefined;
  originChamberCode?: string | undefined;
  title: string;
  type: string;
  updateDate?: string | undefined;
  introducedDate?: string | undefined;
  sponsors?: CongressBillSponsor[] | undefined;
  summaryText?: string | null | undefined;
  /** Official CRS policy area term (one per bill). */
  policyArea?: { name?: string | undefined } | undefined;
  /** Count + referrer URL only; the names come from the /subjects endpoint. */
  subjects?: { count?: number | undefined; url?: string | undefined } | undefined;
  /** Official CRS legislative subject names, pre-fetched from /subjects. */
  legislativeSubjects?: readonly string[] | undefined;
  /** CBO cost estimates linked from the bill detail. */
  cboCostEstimates?: readonly CongressCboEstimate[] | undefined;
}

export interface CongressCboEstimate {
  title?: string | undefined;
  url?: string | undefined;
  pubDate?: string | undefined;
  description?: string | undefined;
}

export interface NormalizedCboEstimate {
  title: string;
  url: string;
  pubDate: string | null;
  description: string | null;
}

export interface CongressVoteMember {
  bioguideId?: string | undefined;
  lisId?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  party?: string | undefined;
  state?: string | undefined;
  votePosition: string;
}

export interface CongressVoteEvent {
  sourceId: string;
  chamber: 'senate' | 'house';
  congress: number;
  session: number;
  rollCallNumber: number;
  voteDate: string;
  question?: string | undefined;
  result: string;
  yeaCount: number;
  nayCount: number;
  abstainCount: number;
  notVotingCount: number;
  billIdentifier?: { type: string; number: string; congress: number } | undefined;
  members: CongressVoteMember[];
  /** Upstream last-updated timestamp, when the source provides one. */
  sourceUpdatedAt?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw API shape types (Congress.gov v3 house-vote endpoint)
// ─────────────────────────────────────────────────────────────────────────────

/** One entry of GET /house-vote/{congress}/{session}. */
export interface HouseVoteApiItem {
  congress: number;
  identifier?: number | undefined;
  legislationNumber?: string | undefined;
  legislationType?: string | undefined;
  legislationUrl?: string | undefined;
  result?: string | undefined;
  rollCallNumber: number;
  sessionNumber: number;
  sourceDataURL?: string | undefined;
  startDate?: string | undefined;
  updateDate?: string | undefined;
  voteType?: string | undefined;
  voteQuestion?: string | undefined;
}

/** One entry of GET /house-vote/{congress}/{session}/{roll}/members → results[]. */
export interface HouseVoteApiMemberVote {
  bioguideID?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  voteCast?: string | undefined;
  voteParty?: string | undefined;
  voteState?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalised output types (maps to DB row types)
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedPolitician {
  bioguideId: string;
  firstName: string;
  lastName: string;
  party: string;
  state: string;
  chamber: 'senate' | 'house';
  district: number | null;
  imageUrl: string | null;
  website: string | null;
  isCurrent: boolean;
}

export interface NormalizedBill {
  congress: number;
  billType: string;
  billNumber: string;
  title: string;
  summary: string | null;
  status: BillStatus;
  sponsorBioguideId: string;
  introducedAt: Date;
  /** Official CRS policy area term, or null when Congress.gov has not assigned one yet. */
  policyArea: string | null;
  /** Official CRS legislative subject terms (trimmed, de-duplicated, order preserved). */
  subjects: string[];
  /** Congress.gov updateDate, when present. */
  sourceUpdatedAt: Date | null;
  /** Official CBO cost estimates (title, url, pubDate, description), url required. */
  cboEstimates: NormalizedCboEstimate[];
}

export interface NormalizedVote {
  sourceId: string;
  chamber: 'senate' | 'house';
  voteDate: Date;
  result: 'passed' | 'failed' | 'tie';
  yeaCount: number;
  nayCount: number;
  abstainCount: number;
  notVotingCount: number;
  billCongress: number | null;
  billType: string | null;
  billNumber: string | null;
  sourceUpdatedAt: Date | null;
  /** The question put to the chamber, as published ("On Passage"…). */
  question: string | null;
}

export interface NormalizedVoteRecord {
  voterBioguideId: string;
  value: VoteValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bill status normalisation
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_PATTERNS: Array<[RegExp, BillStatus]> = [
  [/signed by (the )?president|became (public )?law/i, 'signed'],
  [/vetoed by (the )?president/i, 'vetoed'],
  [/presented to (the )?president|enrolled bill/i, 'enrolled'],
  [/passed (the )?senate|passed senate without/i, 'passed-senate'],
  [/passed (the )?house|passed house without/i, 'passed-house'],
  [/on the floor|called up by|floor consideration|placed on (the )?(senate|house) (legislative |executive )?calendar/i, 'floor'],
  [/referred to|ordered to be reported|reported by|subcommittee|committee/i, 'committee'],
];

/**
 * Map Congress.gov latestAction.text to the canonical internal BillStatus enum.
 * Falls back to 'introduced' when no pattern matches.
 */
export function normalizeBillStatus(latestActionText: string): BillStatus {
  for (const [pattern, status] of STATUS_PATTERNS) {
    if (pattern.test(latestActionText)) return status;
  }
  return 'introduced';
}

// ─────────────────────────────────────────────────────────────────────────────
// Vote value normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map raw vote position strings from Senate.gov and House Clerk XML to the
 * canonical internal VoteValue enum.
 */
export function normalizeVoteValue(raw: string): VoteValue {
  const v = raw.trim().toLowerCase();
  if (v === 'yea' || v === 'yes' || v === 'aye') return 'yea';
  if (v === 'nay' || v === 'no') return 'nay';
  if (v === 'present') return 'abstain';
  return 'not-voting';
}

// ─────────────────────────────────────────────────────────────────────────────
// Vote result normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map raw vote result strings (e.g. "Passed", "Agreed to", "Rejected") to the
 * canonical internal result enum.
 */
export function normalizeVoteResult(raw: string): 'passed' | 'failed' | 'tie' {
  const v = raw.trim().toLowerCase();
  // Check negative patterns before positive ones to avoid false positives
  if (v.includes('failed') || v.includes('rejected') || v.includes('not agreed') || v.includes('defeated')) {
    return 'failed';
  }
  if (v.includes('passed') || v.includes('agreed') || v.includes('confirmed') || v.includes('adopted')) {
    return 'passed';
  }
  if (v.includes('tie')) return 'tie';
  // Default to passed when the result is ambiguous but non-negative
  return 'passed';
}

// ─────────────────────────────────────────────────────────────────────────────
// Member normalisation
// ─────────────────────────────────────────────────────────────────────────────

/** Map Congress.gov partyName to a canonical party string. */
function normalizeParty(partyName: string | undefined): string {
  if (!partyName) return 'Unknown';
  const p = partyName.trim();
  if (p === 'D' || /^democrat/i.test(p)) return 'Democrat';
  if (p === 'R' || /^republican/i.test(p)) return 'Republican';
  if (p === 'I' || /^independent/i.test(p)) return 'Independent';
  return p;
}

/**
 * Parse "LastName, FirstName [MiddleName]" into { firstName, lastName }.
 * Falls back gracefully when the format does not match.
 */
function parseName(raw: string): { firstName: string; lastName: string } {
  const commaIdx = raw.indexOf(',');
  if (commaIdx === -1) {
    const parts = raw.trim().split(/\s+/);
    const lastName = parts.at(-1) ?? raw;
    const firstName = parts.slice(0, -1).join(' ');
    return { firstName, lastName };
  }
  const lastName = raw.slice(0, commaIdx).trim();
  const firstName = raw.slice(commaIdx + 1).trim();
  return { firstName, lastName };
}

/** Determine chamber from the most recent term entry. */
function normalizeChamber(terms: CongressMemberTerm[] | undefined): 'senate' | 'house' {
  const lastTerm = terms?.at(-1);
  const text = (lastTerm?.chamber ?? '').toLowerCase();
  return text.includes('senate') ? 'senate' : 'house';
}

/**
 * Transform a Congress.gov member summary/detail into the canonical
 * NormalizedPolitician shape.
 */
export function normalizeMember(raw: CongressMemberSummary): NormalizedPolitician {
  let firstName = raw.firstName ?? '';
  let lastName = raw.lastName ?? '';

  if ((!firstName || !lastName) && (raw.directOrderName ?? raw.name)) {
    const parsed = parseName((raw.directOrderName ?? raw.name) as string);
    if (!firstName) firstName = parsed.firstName;
    if (!lastName) lastName = parsed.lastName;
  }

  return {
    bioguideId: raw.bioguideId,
    firstName,
    lastName,
    party: normalizeParty(raw.partyName),
    state: raw.state ?? '',
    chamber: normalizeChamber(raw.terms?.item),
    district: raw.district ?? null,
    imageUrl: raw.depiction?.imageUrl ?? null,
    website: raw.officialWebsiteUrl ?? null,
    isCurrent: raw.currentMember ?? true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bill normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform a Congress.gov bill object into the canonical NormalizedBill shape.
 * `summaryText` should be pre-fetched from the bill summaries endpoint.
 */
export function normalizeBill(raw: CongressBillSummary): NormalizedBill {
  const latestActionText = raw.latestAction?.text ?? '';
  const sponsor = raw.sponsors?.[0];
  const introducedAt = raw.introducedDate
    ? new Date(raw.introducedDate)
    : raw.latestAction?.actionDate
      ? new Date(raw.latestAction.actionDate)
      : new Date(0);

  const policyArea = raw.policyArea?.name?.trim() || null;
  const subjects = [
    ...new Set((raw.legislativeSubjects ?? []).map((s) => s.trim()).filter((s) => s.length > 0)),
  ];

  return {
    congress: raw.congress,
    billType: raw.type.toUpperCase(),
    billNumber: raw.number,
    title: raw.title,
    summary: raw.summaryText ?? null,
    status: normalizeBillStatus(latestActionText),
    sponsorBioguideId: sponsor?.bioguideId ?? '',
    introducedAt,
    policyArea,
    subjects,
    sourceUpdatedAt: parseDateOrNull(raw.updateDate),
    cboEstimates: (raw.cboCostEstimates ?? [])
      .filter((e): e is CongressCboEstimate & { url: string } => typeof e.url === 'string' && e.url.length > 0)
      .map((e) => ({
        title: e.title?.trim() || 'CBO cost estimate',
        url: e.url,
        pubDate: e.pubDate ?? null,
        description: e.description?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null,
      })),
  };
}

/** Key identifying a bill within a congress, matching the list and the stored row. */
export function billKey(billType: string, billNumber: string): string {
  return `${billType.toUpperCase()}-${billNumber}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vote normalisation
// ─────────────────────────────────────────────────────────────────────────────

/** Transform a structured vote event into NormalizedVote + NormalizedVoteRecord[]. */
export function normalizeVoteEvent(raw: CongressVoteEvent): {
  vote: NormalizedVote;
  records: NormalizedVoteRecord[];
} {
  const vote: NormalizedVote = {
    sourceId: raw.sourceId,
    chamber: raw.chamber,
    voteDate: new Date(raw.voteDate),
    result: normalizeVoteResult(raw.result),
    yeaCount: raw.yeaCount,
    nayCount: raw.nayCount,
    abstainCount: raw.abstainCount,
    notVotingCount: raw.notVotingCount,
    billCongress: raw.billIdentifier?.congress ?? null,
    billType: raw.billIdentifier?.type ?? null,
    billNumber: raw.billIdentifier?.number ?? null,
    sourceUpdatedAt: parseDateOrNull(raw.sourceUpdatedAt),
    question: raw.question?.trim() || null,
  };

  const records: NormalizedVoteRecord[] = raw.members
    .filter((m) => m.bioguideId)
    .map((m) => ({
      voterBioguideId: m.bioguideId as string,
      value: normalizeVoteValue(m.votePosition),
    }));

  return { vote, records };
}

/** Parse an ISO-8601 string into a Date, or null when absent or invalid. */
/**
 * Parse an upstream timestamp. Congress.gov publishes UTC; a value that carries
 * a time but no zone designator (e.g. "2026-02-25T14:09:11") is read as UTC
 * rather than as the machine's local time, so the same string parses to the
 * same instant on a hosted runner (UTC) and on the home server (local zone).
 * Date-only values ("2026-02-25") are already UTC per the ECMAScript spec.
 */
export function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Congress session helpers
// ─────────────────────────────────────────────────────────────────────────────

/** First calendar year of a given Congress (the 119th began in January 2025). */
export function firstYearOfCongress(congress: number): number {
  return 1787 + 2 * congress;
}

/**
 * The session (1 or 2) of the given Congress that is current on `now`.
 * Dates before the Congress began clamp to 1; dates after it ended clamp to 2.
 */
export function currentSessionFor(congress: number, now: Date = new Date()): 1 | 2 {
  return now.getUTCFullYear() - firstYearOfCongress(congress) <= 0 ? 1 : 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// House vote normalisation (Congress.gov house-vote API)
// ─────────────────────────────────────────────────────────────────────────────

const BILL_TYPE_PATTERN = /^(HR|S|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES)$/;

/** Stable source_id for a House roll-call; shared by normalisation and the change check. */
export function houseVoteSourceId(congress: number, session: number, rollCallNumber: number): string {
  return `house-${congress}-${session}-${rollCallNumber}`;
}

/**
 * Build a CongressVoteEvent from a house-vote list item plus its member votes.
 * Tallies are computed from the member positions so they always agree with
 * the per-member records we store.
 */
export function normalizeHouseVoteApi(
  item: HouseVoteApiItem,
  memberVotes: readonly HouseVoteApiMemberVote[],
): CongressVoteEvent {
  const members: CongressVoteMember[] = memberVotes.map((m) => ({
    bioguideId: m.bioguideID,
    firstName: m.firstName,
    lastName: m.lastName,
    party: m.voteParty,
    state: m.voteState,
    votePosition: m.voteCast ?? 'Not Voting',
  }));

  const tally: Record<VoteValue, number> = { yea: 0, nay: 0, abstain: 0, 'not-voting': 0 };
  for (const m of members) tally[normalizeVoteValue(m.votePosition)]++;

  let billIdentifier: CongressVoteEvent['billIdentifier'];
  const type = item.legislationType?.toUpperCase().replace(/\s+/g, '');
  const number = item.legislationNumber?.trim();
  if (type && number && BILL_TYPE_PATTERN.test(type) && /^\d+$/.test(number)) {
    billIdentifier = { type, number, congress: item.congress };
  }

  return {
    sourceId: houseVoteSourceId(item.congress, item.sessionNumber, item.rollCallNumber),
    chamber: 'house',
    congress: item.congress,
    session: item.sessionNumber,
    rollCallNumber: item.rollCallNumber,
    voteDate: item.startDate ?? '',
    question: item.voteQuestion ?? item.voteType,
    result: item.result ?? '',
    yeaCount: tally.yea,
    nayCount: tally.nay,
    abstainCount: tally.abstain,
    notVotingCount: tally['not-voting'],
    billIdentifier,
    members,
    sourceUpdatedAt: item.updateDate,
  };
}
