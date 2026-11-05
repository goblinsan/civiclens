/**
 * Goal-based alignment scoring (docs/scoring-methodology.md).
 *
 * Pure functions. The database layer aggregates (politician × goal × answer ×
 * coding × vote value) counts; this module turns them into scores and keeps
 * the one piece of judgement that lives in code — which roll-call questions
 * decide a bill — in a single tested place.
 */
import type { GoalEffect, GoalImportance, GoalStance, EffectStrength } from '@civreveal/shared';
import { effectDirection, stanceDirection } from '@civreveal/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Which roll-calls count
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Questions that decide the bill itself. Anything else (motions to recommit,
 * previous-question votes, rules, amendments, tabling) is procedural or acts
 * on something other than the bill as coded, and is excluded until coded
 * separately. Patterns are POSIX-regex compatible so SQL can apply the same
 * filter (`question ~* DECISIVE_QUESTION_PATTERN AND question !~* PROCEDURAL_QUESTION_PATTERN`).
 */
export const DECISIVE_QUESTION_PATTERN =
  '^on (passage|motion to suspend the rules and (pass|agree|concur)|agreeing to the (resolution|concurrent resolution|conference report)|concurring in|motion to concur|overriding the veto)';

export const PROCEDURAL_QUESTION_PATTERN =
  'recommit|previous question|to table|adjourn|journal|quorum|instruct|providing for consideration|motion to commit|agreeing to the amendment|^on the amendment';

const decisive = new RegExp(DECISIVE_QUESTION_PATTERN, 'i');
const procedural = new RegExp(PROCEDURAL_QUESTION_PATTERN, 'i');

export function isDecisiveQuestion(question: string | null | undefined): boolean {
  if (!question) return false;
  const q = question.trim();
  return decisive.test(q) && !procedural.test(q);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

/** One aggregated row: how many times a politician cast `value` on bills coded this way for a goal they answered. */
export interface AggregatedVoteRow {
  politicianId: string;
  goalSlug: string;
  stance: GoalStance;
  importance: GoalImportance;
  effect: GoalEffect;
  strength: EffectStrength;
  value: 'yea' | 'nay';
  count: number;
}

export interface GoalScore {
  /** 0–100; 50 = evenly split. */
  score: number;
  votes: number;
  agreed: number;
}

export interface PoliticianScore {
  score: number;
  totalVotes: number;
  goals: Record<string, GoalScore>;
}

const VOTE_DIRECTION = { yea: 1, nay: -1 } as const;

/**
 * agreement = stance × effect × vote. A yea on a bill that advances a goal
 * you support agrees (+1); so does a nay on one that hinders it. Each vote
 * weighs importance × strength. score = (Σ agreement·weight / Σ weight + 1) / 2 × 100.
 */
export function scorePoliticians(rows: readonly AggregatedVoteRow[]): Map<string, PoliticianScore> {
  type Acc = { raw: number; max: number; votes: number; agreed: number };
  const perPolitician = new Map<string, Map<string, Acc>>();

  for (const row of rows) {
    if (row.count <= 0) continue;
    const agreement = stanceDirection(row.stance) * effectDirection(row.effect) * VOTE_DIRECTION[row.value];
    const weight = row.importance * row.strength;
    const goals = perPolitician.get(row.politicianId) ?? new Map<string, Acc>();
    const acc = goals.get(row.goalSlug) ?? { raw: 0, max: 0, votes: 0, agreed: 0 };
    acc.raw += agreement * weight * row.count;
    acc.max += weight * row.count;
    acc.votes += row.count;
    if (agreement > 0) acc.agreed += row.count;
    goals.set(row.goalSlug, acc);
    perPolitician.set(row.politicianId, goals);
  }

  const result = new Map<string, PoliticianScore>();
  for (const [politicianId, goals] of perPolitician) {
    let raw = 0;
    let max = 0;
    let totalVotes = 0;
    const goalScores: Record<string, GoalScore> = {};
    for (const [slug, acc] of goals) {
      raw += acc.raw;
      max += acc.max;
      totalVotes += acc.votes;
      goalScores[slug] = { score: round1(toScore(acc.raw, acc.max)), votes: acc.votes, agreed: acc.agreed };
    }
    result.set(politicianId, { score: round2(toScore(raw, max)), totalVotes, goals: goalScores });
  }
  return result;
}

export function toScore(raw: number, max: number): number {
  if (max <= 0) return 50;
  return Math.max(0, Math.min(100, ((raw / max + 1) / 2) * 100));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
