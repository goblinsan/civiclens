import { describe, it, expect, vi } from 'vitest';
import { createQuestionnaireRepository } from '../repositories/questionnaire.js';
import type { DbPool } from '@civreveal/db';

type Call = [string, unknown[] | undefined];

function makePoolMock(overrides: Record<string, unknown[]> = {}) {
  const mock = {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      for (const [pattern, rows] of Object.entries(overrides)) {
        if (sql.includes(pattern)) return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
  return mock as unknown as DbPool;
}

function calls(pool: DbPool): Call[] {
  return (pool.query as unknown as ReturnType<typeof vi.fn>).mock.calls as Call[];
}

const fakeProfile = {
  id: '07000000-0000-0000-0000-000000000001',
  session_id: 'test-session-123',
  submitted_at: new Date(),
  created_at: new Date(),
};

describe('createQuestionnaireRepository', () => {
  describe('getProfileBySessionId', () => {
    it('returns the profile when found', async () => {
      const pool = makePoolMock({ 'WHERE session_id': [fakeProfile] });
      const profile = await createQuestionnaireRepository(pool).getProfileBySessionId('test-session-123');
      expect(profile?.session_id).toBe('test-session-123');
    });

    it('returns null when not found', async () => {
      const profile = await createQuestionnaireRepository(makePoolMock()).getProfileBySessionId('nonexistent');
      expect(profile).toBeNull();
    });
  });

  describe('upsertProfile', () => {
    it('inserts or refreshes submitted_at and returns the row', async () => {
      const pool = makePoolMock({ RETURNING: [fakeProfile] });
      const profile = await createQuestionnaireRepository(pool).upsertProfile('test-session-123');
      expect(profile.session_id).toBe('test-session-123');
      expect(calls(pool)[0]![0]).toContain('ON CONFLICT');
      expect(calls(pool)[0]![0]).toContain('submitted_at');
    });
  });

  describe('replaceGoalAnswers', () => {
    it('removes answers not in the list, then upserts the rest by slug', async () => {
      const pool = makePoolMock({ 'INSERT INTO questionnaire_goal_answers': [{}, {}] });
      const stored = await createQuestionnaireRepository(pool).replaceGoalAnswers('prof-id', [
        { goalSlug: 'energy-nuclear-expand', stance: 'support', importance: 3 },
        { goalSlug: 'health-single-payer', stance: 'oppose', importance: 1 },
      ]);
      expect(stored).toBe(2);
      const [del, ins] = calls(pool);
      expect(del![0]).toContain('DELETE FROM questionnaire_goal_answers');
      expect(del![1]).toEqual(['prof-id', ['energy-nuclear-expand', 'health-single-payer']]);
      expect(ins![0]).toContain('JOIN policy_goals g ON g.slug = x.slug AND g.is_active');
      expect(ins![1]).toEqual([
        'prof-id',
        ['energy-nuclear-expand', 'health-single-payer'],
        ['support', 'oppose'],
        [3, 1],
      ]);
    });

    it('with no answers only clears the profile', async () => {
      const pool = makePoolMock();
      const stored = await createQuestionnaireRepository(pool).replaceGoalAnswers('prof-id', []);
      expect(stored).toBe(0);
      expect(calls(pool)).toHaveLength(1);
    });
  });

  describe('computeAndSaveMatchResults', () => {
    it('aggregates decisive votes on coded bills, scores, and stores one row per sitting member', async () => {
      const aggregated = [
        { politician_id: 'pol-1', goal_slug: 'energy-nuclear-expand', stance: 'support', importance: 2, effect: 'advances', strength: 2, value: 'yea', vote_count: 2 },
        { politician_id: 'pol-1', goal_slug: 'energy-nuclear-expand', stance: 'support', importance: 2, effect: 'advances', strength: 2, value: 'nay', vote_count: 1 },
      ];
      const pool = makePoolMock({
        'FROM questionnaire_goal_answers qa': aggregated,
        'FROM politicians WHERE is_current': [{ id: 'pol-1' }, { id: 'pol-2' }],
      });
      await createQuestionnaireRepository(pool).computeAndSaveMatchResults('prof-id');

      const agg = calls(pool)[0]!;
      expect(agg[0]).toContain("v.question ~* '^on (passage");
      expect(agg[0]).toContain("v.question !~* 'recommit");

      const insert = calls(pool).find((c) => c[0].includes('INSERT INTO match_results'))!;
      const [profileId, ids, scores, breakdowns] = insert[1] as [string, string[], string[], string[]];
      expect(profileId).toBe('prof-id');
      expect(ids).toEqual(['pol-1', 'pol-2']);
      // pol-1: raw = 4·2 − 4·1 = 4, max = 12 → (1/3 + 1)/2 = 66.67
      expect(scores).toEqual(['66.67', '50.00']);
      const b1 = JSON.parse(breakdowns[0]!);
      expect(b1.model).toBe('goals-v1');
      expect(b1._total_votes).toBe(3);
      expect(b1.goals['energy-nuclear-expand']).toEqual({ score: 66.7, votes: 3, agreed: 2 });
      expect(JSON.parse(breakdowns[1]!)).toEqual({ model: 'goals-v1', goals: {}, _total_votes: 0 });
    });

    it('writes nothing when there are no sitting members', async () => {
      const pool = makePoolMock();
      await createQuestionnaireRepository(pool).computeAndSaveMatchResults('prof-id');
      expect(calls(pool).some((c) => c[0].includes('INSERT INTO match_results'))).toBe(false);
    });
  });

  describe('getMatchResultsBySessionId', () => {
    it('returns ranked rows for sitting members', async () => {
      const row = { id: 'mr-1', politician_id: 'pol-1', score: '75.00', breakdown: {}, total_votes: 3 };
      const pool = makePoolMock({ 'FROM match_results': [row] });
      const results = await createQuestionnaireRepository(pool).getMatchResultsBySessionId('s');
      expect(results).toHaveLength(1);
      expect(calls(pool)[0]![0]).toContain('p.is_current = true');
      expect(calls(pool)[0]![0]).toContain('ORDER BY mr.score DESC');
    });
  });

  describe('getMatchEvidence', () => {
    it('lists decisive votes for one politician with the agreement computed in SQL', async () => {
      const pool = makePoolMock({ 'AS agreed': [{ vote_id: 'v1', agreed: true }] });
      const rows = await createQuestionnaireRepository(pool).getMatchEvidence('s', 'pol-1');
      expect(rows[0]?.agreed).toBe(true);
      const call = calls(pool)[0]!;
      expect(call[0]).toContain('vr.politician_id = $2');
      expect(call[0]).toContain("v.question ~* '^on (passage");
      expect(call[1]).toEqual(['s', 'pol-1']);
    });
  });
});
