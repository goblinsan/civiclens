/**
 * tagging.ts
 *
 * Derives CivReveal policy tags from the official classification that the
 * Congressional Research Service (CRS) assigns to every bill on Congress.gov:
 *
 *   - exactly one *policy area* term, drawn from a controlled list of ~32 values
 *   - zero or more *legislative subject* terms, drawn from a larger controlled
 *     vocabulary
 *
 * The two mapping tables below are the complete rule set. They are reproduced
 * in docs/bill-tagging.md so anyone can audit them. Anything not listed is
 * deliberately left untagged: a bill with no tag simply does not count toward
 * any alignment score, which is safer than guessing.
 *
 * A tag describes what a bill is *about*. It does not say which direction a
 * "yea" vote pushes that topic — that is a separate, later layer.
 *
 * Pure and side-effect free so it can be unit-tested exhaustively.
 */

import { POLICY_TAGS } from '@civreveal/shared';
import type { PolicyTag } from '@civreveal/shared';

export type TagSource = 'policy-area' | 'subject';

export interface DerivedTag {
  tag: PolicyTag;
  source: TagSource;
  /** The official CRS term (as published) that produced this tag. */
  matchedOn: string;
}

export interface TagInput {
  policyArea: string | null | undefined;
  subjects: readonly string[] | null | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Controlled list of CRS policy area terms
// https://www.congress.gov/help/field-values/policy-area
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWN_POLICY_AREAS = [
  'Agriculture and Food',
  'Animals',
  'Armed Forces and National Security',
  'Arts, Culture, Religion',
  'Civil Rights and Liberties, Minority Issues',
  'Commerce',
  'Congress',
  'Crime and Law Enforcement',
  'Economics and Public Finance',
  'Education',
  'Emergency Management',
  'Energy',
  'Environmental Protection',
  'Families',
  'Finance and Financial Sector',
  'Foreign Trade and International Finance',
  'Government Operations and Politics',
  'Health',
  'Housing and Community Development',
  'Immigration',
  'International Affairs',
  'Labor and Employment',
  'Law',
  'Native Americans',
  'Private Legislation',
  'Public Lands and Natural Resources',
  'Science, Technology, Communications',
  'Social Welfare',
  'Sports and Recreation',
  'Taxation',
  'Transportation and Public Works',
  'Water Resources Development',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Policy area → tags
//
// Policy areas that are intentionally NOT mapped (too broad, or no matching
// questionnaire topic): Agriculture and Food; Animals; Arts, Culture, Religion;
// Congress; Crime and Law Enforcement; Emergency Management; Families;
// Government Operations and Politics; Law; Native Americans; Private
// Legislation; Science, Technology, Communications; Social Welfare; Sports and
// Recreation. Bills in those areas can still pick up a tag from a subject term.
// ─────────────────────────────────────────────────────────────────────────────

export const POLICY_AREA_TAGS: Readonly<Record<string, readonly PolicyTag[]>> = {
  'Health': ['healthcare'],
  'Education': ['education'],
  'Environmental Protection': ['environment'],
  'Energy': ['environment'],
  'Public Lands and Natural Resources': ['environment'],
  'Water Resources Development': ['environment', 'infrastructure'],
  'Economics and Public Finance': ['economy'],
  'Taxation': ['economy'],
  'Commerce': ['economy'],
  'Finance and Financial Sector': ['economy'],
  'Labor and Employment': ['economy'],
  'Foreign Trade and International Finance': ['economy', 'foreign-policy'],
  'Armed Forces and National Security': ['defense'],
  'Immigration': ['immigration'],
  'Housing and Community Development': ['housing'],
  'Transportation and Public Works': ['infrastructure'],
  'Civil Rights and Liberties, Minority Issues': ['civil-rights'],
  'International Affairs': ['foreign-policy'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Legislative subject → tags
//
// Subject terms are more specific than policy areas, so they let a bill filed
// under an unmapped policy area (e.g. "Social Welfare") still be tagged when
// it clearly concerns a questionnaire topic (e.g. "Medicaid"). Only terms that
// map unambiguously to a topic are listed.
// ─────────────────────────────────────────────────────────────────────────────

export const SUBJECT_TAGS: Readonly<Record<string, readonly PolicyTag[]>> = {
  // ── healthcare ──────────────────────────────────────────────────────────
  'Health care coverage and access': ['healthcare'],
  'Health care costs and insurance': ['healthcare'],
  'Health programs administration and funding': ['healthcare'],
  'Medicare': ['healthcare'],
  'Medicaid': ['healthcare'],
  'Prescription drugs': ['healthcare'],
  'Mental health': ['healthcare'],
  'Hospital care': ['healthcare'],
  'Health personnel': ['healthcare'],
  'Child health': ['healthcare'],
  "Women's health": ['healthcare'],
  "Veterans' medical care": ['healthcare', 'defense'],

  // ── education ───────────────────────────────────────────────────────────
  'Elementary and secondary education': ['education'],
  'Higher education': ['education'],
  'Student aid and college costs': ['education'],
  'Education programs funding': ['education'],
  'Teaching, teachers, curricula': ['education'],
  'Vocational and technical education': ['education'],
  'Special education': ['education'],
  'Preschool education': ['education'],
  'Educational facilities': ['education'],

  // ── environment ─────────────────────────────────────────────────────────
  'Climate change and greenhouse gases': ['environment'],
  'Air quality': ['environment'],
  'Water quality': ['environment'],
  'Environmental assessment, monitoring, research': ['environment'],
  'Environmental regulatory procedures': ['environment'],
  'Hazardous wastes and toxic substances': ['environment'],
  'Wildlife conservation and habitat protection': ['environment'],
  'Endangered and threatened species': ['environment'],
  'Alternative and renewable resources': ['environment'],
  'Energy efficiency and conservation': ['environment'],
  'Solid waste and recycling': ['environment'],

  // ── economy ─────────────────────────────────────────────────────────────
  'Income tax rates': ['economy'],
  'Income tax deductions': ['economy'],
  'Income tax credits': ['economy'],
  'Budget deficits and national debt': ['economy'],
  'Small business': ['economy'],
  'Wages and earnings': ['economy'],
  'Employment and training programs': ['economy'],
  'Unemployment': ['economy'],
  'Inflation and prices': ['economy'],
  'Economic development': ['economy'],
  'Business investment and capital': ['economy'],
  'Banking and financial institutions regulation': ['economy'],
  'Trade agreements and negotiations': ['economy', 'foreign-policy'],

  // ── defense ─────────────────────────────────────────────────────────────
  'Military operations and strategy': ['defense'],
  'Military procurement, research, weapons development': ['defense'],
  'Defense spending': ['defense'],
  'Military personnel and dependents': ['defense'],
  'Military readiness': ['defense'],
  'Military education and training': ['defense'],
  'Military facilities and property': ['defense'],
  'Nuclear weapons': ['defense'],
  'Intelligence activities, surveillance, classified information': ['defense'],
  'Terrorism': ['defense'],
  "Veterans' education, employment, rehabilitation": ['defense'],
  "Veterans' pensions and compensation": ['defense'],
  'Military assistance, sales, and agreements': ['defense', 'foreign-policy'],

  // ── immigration ─────────────────────────────────────────────────────────
  'Border security and unlawful immigration': ['immigration'],
  'Immigration status and procedures': ['immigration'],
  'Citizenship and naturalization': ['immigration'],
  'Visas and passports': ['immigration'],
  'Refugees, asylum, displaced persons': ['immigration'],
  'Foreign labor': ['immigration'],

  // ── housing ─────────────────────────────────────────────────────────────
  'Housing finance and home ownership': ['housing'],
  'Low- and moderate-income housing': ['housing'],
  'Housing supply and affordability': ['housing'],
  'Public housing': ['housing'],
  'Homelessness and emergency shelter': ['housing'],
  'Residential rehabilitation and home repair': ['housing'],
  'Housing industry and standards': ['housing'],

  // ── infrastructure ──────────────────────────────────────────────────────
  'Roads and highways': ['infrastructure'],
  'Public transit': ['infrastructure'],
  'Railroads': ['infrastructure'],
  'Broadband and internet access': ['infrastructure'],
  'Infrastructure development': ['infrastructure'],
  'Aviation and airports': ['infrastructure'],
  'Transportation programs funding': ['infrastructure'],
  'Electric power generation and transmission': ['infrastructure'],
  'Dams and canals': ['infrastructure'],

  // ── civil-rights ────────────────────────────────────────────────────────
  'Voting rights': ['civil-rights'],
  'Racial and ethnic relations': ['civil-rights'],
  'Sex, gender, sexual orientation discrimination': ['civil-rights'],
  'Disability and health-based discrimination': ['civil-rights'],
  'Age discrimination': ['civil-rights'],
  'Due process and equal protection': ['civil-rights'],
  'First Amendment rights': ['civil-rights'],
  'Right of privacy': ['civil-rights'],
  'Freedom of information': ['civil-rights'],

  // ── foreign-policy ──────────────────────────────────────────────────────
  'Diplomacy, foreign officials, Americans abroad': ['foreign-policy'],
  'Foreign aid and international relief': ['foreign-policy'],
  'International organizations and cooperation': ['foreign-policy'],
  'Sanctions': ['foreign-policy'],
  'Alliances': ['foreign-policy'],
  'Human rights': ['foreign-policy'],
  'Arms control and nonproliferation': ['foreign-policy'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/** Case- and whitespace-insensitive key for matching official terms. */
function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildIndex(table: Readonly<Record<string, readonly PolicyTag[]>>) {
  return new Map(Object.entries(table).map(([term, tags]) => [normalizeTerm(term), tags]));
}

const policyAreaIndex = buildIndex(POLICY_AREA_TAGS);
const subjectIndex = buildIndex(SUBJECT_TAGS);
const knownPolicyAreas = new Set(KNOWN_POLICY_AREAS.map(normalizeTerm));
const tagOrder = new Map<PolicyTag, number>(POLICY_TAGS.map((t, i) => [t, i]));

/**
 * True when the term is in the controlled CRS policy area list.
 * Used by the ingest job to surface unexpected values (typos, list changes)
 * rather than silently ignoring them.
 */
export function isKnownPolicyArea(name: string): boolean {
  return knownPolicyAreas.has(normalizeTerm(name));
}

/**
 * Derive policy tags from a bill's official classification.
 *
 * - Each tag appears at most once. If both the policy area and a subject
 *   produce the same tag, the policy area wins as the recorded source.
 * - Output is sorted in POLICY_TAGS order so results are deterministic.
 * - Unknown or unmapped terms never throw; they simply produce no tag.
 */
export function deriveTags(input: TagInput): DerivedTag[] {
  const out: DerivedTag[] = [];
  const seen = new Set<PolicyTag>();

  const add = (tag: PolicyTag, source: TagSource, matchedOn: string) => {
    if (seen.has(tag)) return;
    seen.add(tag);
    out.push({ tag, source, matchedOn });
  };

  const policyArea = input.policyArea?.trim();
  if (policyArea) {
    for (const tag of policyAreaIndex.get(normalizeTerm(policyArea)) ?? []) {
      add(tag, 'policy-area', policyArea);
    }
  }

  for (const rawSubject of input.subjects ?? []) {
    const subject = rawSubject.trim();
    if (!subject) continue;
    for (const tag of subjectIndex.get(normalizeTerm(subject)) ?? []) {
      add(tag, 'subject', subject);
    }
  }

  return out.sort((a, b) => (tagOrder.get(a.tag) ?? 0) - (tagOrder.get(b.tag) ?? 0));
}
