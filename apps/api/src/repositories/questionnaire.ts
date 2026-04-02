import type { DbPool, MatchResultRow, PolicyTagRow, QuestionnaireProfileRow } from '@civiclens/db';

const STANCE_WEIGHT: Record<string, number> = {
  'strongly-support': 2,
  support: 1,
  neutral: 0,
  oppose: -1,
  'strongly-oppose': -2,
};

const VOTE_DIRECTION: Record<string, number> = {
  yea: 1,
  nay: -1,
  abstain: 0,
  'not-voting': 0,
};

interface VotingDataRow {
  politician_id: string;
  tag_slug: string;
  stance: string;
  vote_value: string;
  vote_count: string; // COUNT(*)::int – pg returns smallish ints as number, but type as string to be safe
}

export interface MatchResultWithPolitician extends MatchResultRow {
  first_name: string;
  last_name: string;
  party: string;
  state: string;
  chamber: 'senate' | 'house';
  image_url: string | null;
  bioguide_id: string;
  /** Number of relevant (yea/nay) votes used to compute the score. */
  total_votes: number;
}

export function createQuestionnaireRepository(pool: DbPool) {
  /** Return all policy tags ordered alphabetically by slug. */
  async function listPolicyTags(): Promise<PolicyTagRow[]> {
    const result = await pool.query<PolicyTagRow>(
      `SELECT * FROM policy_tags ORDER BY label ASC`,
    );
    return result.rows;
  }

  /** Look up an existing questionnaire profile by session ID. Returns null if absent. */
  async function getProfileBySessionId(
    sessionId: string,
  ): Promise<QuestionnaireProfileRow | null> {
    const result = await pool.query<QuestionnaireProfileRow>(
      `SELECT * FROM questionnaire_profiles WHERE session_id = $1`,
      [sessionId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Create a profile for the session, or refresh its submitted_at timestamp if
   * the session already has a profile.  Always returns the resulting row.
   */
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
   * Save (or overwrite) the answers for a profile.
   * Each response maps a policy-tag slug to a stance value.
   */
  async function upsertAnswers(
    profileId: string,
    responses: Array<{ tagSlug: string; stance: string }>,
  ): Promise<void> {
    if (responses.length === 0) return;

    const slugs = responses.map((r) => r.tagSlug);
    const tagResult = await pool.query<PolicyTagRow>(
      `SELECT * FROM policy_tags WHERE slug = ANY($1)`,
      [slugs],
    );
    const tagIdBySlug = new Map(tagResult.rows.map((t) => [t.slug, t.id]));

    for (const resp of responses) {
      const tagId = tagIdBySlug.get(resp.tagSlug);
      if (!tagId) continue;
      await pool.query(
        `INSERT INTO questionnaire_answers (profile_id, policy_tag_id, stance)
         VALUES ($1, $2, $3)
         ON CONFLICT (profile_id, policy_tag_id) DO UPDATE SET stance = $3`,
        [profileId, tagId, resp.stance],
      );
    }
  }

  /**
   * Compute alignment scores for every politician and persist them as
   * match_results rows for the given profile.
   *
   * Scoring algorithm (see docs/scoring-methodology.md for full detail):
   *   - Stance weight: strongly-support=+2, support=+1, neutral=0 (skipped),
   *     oppose=-1, strongly-oppose=-2.
   *   - Vote direction: yea=+1, nay=-1, abstain/not-voting=0 (not counted).
   *   - Per (tag, politician) pair:
   *       raw      = Σ weight × direction × count
   *       possible = Σ |weight| × count   (only yea/nay votes)
   *   - Overall score = clamp(((raw / possible) + 1) / 2 × 100, 0, 100)
   *   - When no relevant votes exist, score defaults to 50 (no data).
   */
  async function computeAndSaveMatchResults(profileId: string): Promise<void> {
    // Aggregate (politician × tag × stance × vote_value) counts in one query.
    const votingData = await pool.query<VotingDataRow>(
      `SELECT
         vr.politician_id,
         pt.slug    AS tag_slug,
         qa.stance,
         vr.value   AS vote_value,
         COUNT(*)::int AS vote_count
       FROM questionnaire_answers qa
       JOIN policy_tags   pt ON pt.id        = qa.policy_tag_id
       JOIN bill_tags     bt ON bt.policy_tag_id = qa.policy_tag_id
       JOIN votes         v  ON v.bill_id    = bt.bill_id
       JOIN vote_records  vr ON vr.vote_id   = v.id
       WHERE qa.profile_id = $1
         AND qa.stance     != 'neutral'
         AND vr.value      IN ('yea', 'nay')
       GROUP BY vr.politician_id, pt.slug, qa.stance, vr.value`,
      [profileId],
    );

    const politiciansResult = await pool.query<{ id: string }>(
      `SELECT id FROM politicians`,
    );

    // Index voting data by politician.
    const byPolitician = new Map<string, VotingDataRow[]>();
    for (const row of votingData.rows) {
      const list = byPolitician.get(row.politician_id) ?? [];
      list.push(row);
      byPolitician.set(row.politician_id, list);
    }

    for (const { id: politicianId } of politiciansResult.rows) {
      const rows = byPolitician.get(politicianId) ?? [];

      let totalRaw = 0;
      let maxPossible = 0;
      let totalVotes = 0;
      const breakdown: Record<string, number> = {};

      // Group by tag slug.
      const byTag = new Map<string, VotingDataRow[]>();
      for (const row of rows) {
        const list = byTag.get(row.tag_slug) ?? [];
        list.push(row);
        byTag.set(row.tag_slug, list);
      }

      for (const [tag, tagRows] of byTag.entries()) {
        let tagRaw = 0;
        let tagMax = 0;

        for (const row of tagRows) {
          const weight = STANCE_WEIGHT[row.stance] ?? 0;
          const direction = VOTE_DIRECTION[row.vote_value] ?? 0;
          const count = Number(row.vote_count);

          if (direction !== 0 && weight !== 0) {
            tagRaw += weight * direction * count;
            tagMax += Math.abs(weight) * count;
            totalVotes += count;
          }
        }

        if (tagMax > 0) {
          const tagScore = ((tagRaw / tagMax) + 1) / 2 * 100;
          breakdown[tag] = Math.round(tagScore * 10) / 10;
          totalRaw += tagRaw;
          maxPossible += tagMax;
        }
      }

      const score =
        maxPossible > 0 ? ((totalRaw / maxPossible) + 1) / 2 * 100 : 50;
      const clampedScore = Math.max(0, Math.min(100, score));

      await pool.query(
        `INSERT INTO match_results (profile_id, politician_id, score, breakdown)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (profile_id, politician_id)
         DO UPDATE SET score = $3, breakdown = $4, computed_at = NOW()`,
        [
          profileId,
          politicianId,
          clampedScore.toFixed(2),
          JSON.stringify({ ...breakdown, _total_votes: totalVotes }),
        ],
      );
    }
  }

  /** Return ranked match results with politician details for a session. */
  async function getMatchResultsBySessionId(
    sessionId: string,
  ): Promise<MatchResultWithPolitician[]> {
    const result = await pool.query<MatchResultWithPolitician>(
      `SELECT
         mr.id,
         mr.profile_id,
         mr.politician_id,
         mr.score,
         mr.breakdown,
         mr.computed_at,
         p.first_name,
         p.last_name,
         p.party,
         p.state,
         p.chamber,
         p.image_url,
         p.bioguide_id,
         COALESCE((mr.breakdown->>'_total_votes')::int, 0) AS total_votes
       FROM match_results mr
       JOIN questionnaire_profiles qp ON qp.id = mr.profile_id
       JOIN politicians             p  ON p.id  = mr.politician_id
       WHERE qp.session_id = $1
       ORDER BY mr.score DESC, p.last_name ASC, p.first_name ASC`,
      [sessionId],
    );
    return result.rows;
  }

  return {
    listPolicyTags,
    getProfileBySessionId,
    upsertProfile,
    upsertAnswers,
    computeAndSaveMatchResults,
    getMatchResultsBySessionId,
  };
}

export type QuestionnaireRepository = ReturnType<typeof createQuestionnaireRepository>;
