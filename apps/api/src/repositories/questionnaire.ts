import type { DbPool, MatchResultRow, QuestionnaireProfileRow } from '@civreveal/db';
import type { GoalImportance, GoalStance } from '@civreveal/shared';
import {
  DECISIVE_QUESTION_PATTERN,
  PROCEDURAL_QUESTION_PATTERN,
  scorePoliticians,
} from '../scoring/goalScoring.js';
import type { AggregatedVoteRow } from '../scoring/goalScoring.js';

export interface GoalAnswerInput {
  goalSlug: string;
  stance: GoalStance;
  importance: GoalImportance;
}

export interface MatchResultWithPolitician extends MatchResultRow {
  first_name: string;
  last_name: string;
  party: string;
  state: string;
  chamber: 'senate' | 'house';
  image_url: string | null;
  bioguide_id: string;
  /** Number of decisive yea/nay votes on coded bills used to compute the score. */
  total_votes: number;
}

/** One vote that moved a politician's score, with everything needed to check it. */
export interface MatchEvidenceRow {
  vote_id: string;
  vote_date: Date;
  question: string;
  chamber: 'senate' | 'house';
  bill_id: string;
  bill_type: string;
  bill_number: string;
  bill_title: string;
  goal_slug: string;
  goal_statement: string;
  effect: 'advances' | 'hinders';
  strength: number;
  stance: GoalStance;
  importance: number;
  position: 'yea' | 'nay';
  /** True when the vote went the way the respondent would have wanted. */
  agreed: boolean;
}

interface AggregatedRow {
  politician_id: string;
  goal_slug: string;
  stance: GoalStance;
  importance: number;
  effect: 'advances' | 'hinders';
  strength: number;
  value: 'yea' | 'nay';
  vote_count: string | number;
}

/** SQL fragment: only roll-calls that decide the bill count (see scoring/goalScoring.ts). */
const DECISIVE_SQL = `v.question ~* '${DECISIVE_QUESTION_PATTERN}' AND v.question !~* '${PROCEDURAL_QUESTION_PATTERN}'`;

export function createQuestionnaireRepository(pool: DbPool) {
  async function getProfileBySessionId(sessionId: string): Promise<QuestionnaireProfileRow | null> {
    const result = await pool.query<QuestionnaireProfileRow>(
      `SELECT * FROM questionnaire_profiles WHERE session_id = $1`,
      [sessionId],
    );
    return result.rows[0] ?? null;
  }

  /** Create a profile for the session, or refresh its submitted_at. */
  async function upsertProfile(sessionId: string): Promise<QuestionnaireProfileRow> {
    const result = await pool.query<QuestionnaireProfileRow>(
      `INSERT INTO questionnaire_profiles (session_id)
       VALUES ($1)
       ON CONFLICT (session_id) DO UPDATE SET submitted_at = NOW()
       RETURNING *`,
      [sessionId],
    );
    return result.rows[0]!;
  }

  /**
   * Replace the profile's goal answers. A goal absent from `answers` is a
   * skip and is removed. Unknown slugs are ignored. Returns how many were stored.
   */
  async function replaceGoalAnswers(profileId: string, answers: readonly GoalAnswerInput[]): Promise<number> {
    const slugs = answers.map((a) => a.goalSlug);
    const stances = answers.map((a) => a.stance);
    const importances = answers.map((a) => a.importance);

    await pool.query(
      `DELETE FROM questionnaire_goal_answers
       WHERE profile_id = $1 AND goal_id NOT IN (SELECT id FROM policy_goals WHERE slug = ANY($2::text[]))`,
      [profileId, slugs],
    );
    if (answers.length === 0) return 0;

    const result = await pool.query(
      `INSERT INTO questionnaire_goal_answers (profile_id, goal_id, stance, importance)
       SELECT $1, g.id, x.stance, x.importance
       FROM unnest($2::text[], $3::text[], $4::smallint[]) AS x(slug, stance, importance)
       JOIN policy_goals g ON g.slug = x.slug AND g.is_active
       ON CONFLICT (profile_id, goal_id) DO UPDATE SET
         stance = EXCLUDED.stance,
         importance = EXCLUDED.importance`,
      [profileId, slugs, stances, importances],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Score every sitting member against the profile's goal answers and store
   * the results. Aggregates in SQL (politician × goal × answer × coding × vote
   * value → count), scores in scoring/goalScoring.ts.
   */
  async function computeAndSaveMatchResults(profileId: string): Promise<void> {
    const aggregated = await pool.query<AggregatedRow>(
      `SELECT vr.politician_id,
              g.slug      AS goal_slug,
              qa.stance,
              qa.importance,
              e.effect,
              e.strength,
              vr.value,
              COUNT(*)::int AS vote_count
       FROM questionnaire_goal_answers qa
       JOIN policy_goals      g  ON g.id = qa.goal_id
       JOIN bill_goal_effects e  ON e.goal_id = qa.goal_id
       JOIN votes             v  ON v.bill_id = e.bill_id
       JOIN vote_records      vr ON vr.vote_id = v.id
       WHERE qa.profile_id = $1
         AND vr.value IN ('yea', 'nay')
         AND ${DECISIVE_SQL}
       GROUP BY vr.politician_id, g.slug, qa.stance, qa.importance, e.effect, e.strength, vr.value`,
      [profileId],
    );

    const rows: AggregatedVoteRow[] = aggregated.rows.map((r) => ({
      politicianId: r.politician_id,
      goalSlug: r.goal_slug,
      stance: r.stance,
      importance: Number(r.importance) as GoalImportance,
      effect: r.effect,
      strength: Number(r.strength) as 1 | 2 | 3,
      value: r.value,
      count: Number(r.vote_count),
    }));
    const scores = scorePoliticians(rows);

    // Rank sitting members only; a member with no decisive vote on any coded
    // bill for the answered goals scores 50 with no data.
    const politicians = await pool.query<{ id: string }>(`SELECT id FROM politicians WHERE is_current = true`);
    const ids: string[] = [];
    const scoreValues: string[] = [];
    const breakdowns: string[] = [];
    for (const { id } of politicians.rows) {
      const s = scores.get(id);
      ids.push(id);
      scoreValues.push((s?.score ?? 50).toFixed(2));
      breakdowns.push(JSON.stringify({ model: 'goals-v1', goals: s?.goals ?? {}, _total_votes: s?.totalVotes ?? 0 }));
    }
    if (ids.length === 0) return;

    await pool.query(
      `INSERT INTO match_results (profile_id, politician_id, score, breakdown)
       SELECT $1, x.politician_id, x.score::numeric, x.breakdown::jsonb
       FROM unnest($2::uuid[], $3::text[], $4::text[]) AS x(politician_id, score, breakdown)
       ON CONFLICT (profile_id, politician_id)
       DO UPDATE SET score = EXCLUDED.score, breakdown = EXCLUDED.breakdown, computed_at = NOW()`,
      [profileId, ids, scoreValues, breakdowns],
    );
  }

  /** Ranked match results with politician details for a session. */
  async function getMatchResultsBySessionId(sessionId: string): Promise<MatchResultWithPolitician[]> {
    const result = await pool.query<MatchResultWithPolitician>(
      `SELECT
         mr.id, mr.profile_id, mr.politician_id, mr.score, mr.breakdown, mr.computed_at,
         p.first_name, p.last_name, p.party, p.state, p.chamber, p.image_url, p.bioguide_id,
         COALESCE((mr.breakdown->>'_total_votes')::int, 0) AS total_votes
       FROM match_results mr
       JOIN questionnaire_profiles qp ON qp.id = mr.profile_id
       JOIN politicians             p  ON p.id  = mr.politician_id
       WHERE qp.session_id = $1 AND p.is_current = true
       ORDER BY mr.score DESC, p.last_name ASC, p.first_name ASC`,
      [sessionId],
    );
    return result.rows;
  }

  /** Every decisive vote by one politician that counted toward the session's score. */
  async function getMatchEvidence(sessionId: string, politicianId: string): Promise<MatchEvidenceRow[]> {
    const result = await pool.query<MatchEvidenceRow>(
      `SELECT v.id AS vote_id, v.vote_date, v.question, v.chamber,
              b.id AS bill_id, b.bill_type, b.bill_number, b.title AS bill_title,
              g.slug AS goal_slug, g.statement AS goal_statement,
              e.effect, e.strength, qa.stance, qa.importance,
              vr.value AS position,
              ((CASE qa.stance WHEN 'support' THEN 1 ELSE -1 END)
               * (CASE e.effect WHEN 'advances' THEN 1 ELSE -1 END)
               * (CASE vr.value WHEN 'yea' THEN 1 ELSE -1 END)) > 0 AS agreed
       FROM questionnaire_profiles qp
       JOIN questionnaire_goal_answers qa ON qa.profile_id = qp.id
       JOIN policy_goals      g  ON g.id = qa.goal_id
       JOIN bill_goal_effects e  ON e.goal_id = qa.goal_id
       JOIN bills             b  ON b.id = e.bill_id
       JOIN votes             v  ON v.bill_id = b.id
       JOIN vote_records      vr ON vr.vote_id = v.id AND vr.politician_id = $2
       WHERE qp.session_id = $1
         AND vr.value IN ('yea', 'nay')
         AND ${DECISIVE_SQL}
       ORDER BY v.vote_date DESC, g.sort_order`,
      [sessionId, politicianId],
    );
    return result.rows;
  }

  return {
    getProfileBySessionId,
    upsertProfile,
    replaceGoalAnswers,
    computeAndSaveMatchResults,
    getMatchResultsBySessionId,
    getMatchEvidence,
  };
}

export type QuestionnaireRepository = ReturnType<typeof createQuestionnaireRepository>;
