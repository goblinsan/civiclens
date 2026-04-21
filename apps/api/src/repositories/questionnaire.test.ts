import { describe, it, expect, vi } from 'vitest';
import { createQuestionnaireRepository } from '../repositories/questionnaire.js';
import type { DbPool } from '@civreveal/db';

function makePoolMock(overrides: Record<string, unknown[]> = {}) {
  const mock = {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      for (const [pattern, rows] of Object.entries(overrides)) {
        if (sql.includes(pattern)) {
          return { rows, rowCount: rows.length };
        }
      }
      return { rows: [], rowCount: 0 };
    }),
  };
  return mock as unknown as DbPool;
}

const fakeTag = {
  id: '01000000-0000-0000-0000-000000000001',
  slug: 'healthcare',
  label: 'Healthcare',
};

const fakeProfile = {
  id: '07000000-0000-0000-0000-000000000001',
  session_id: 'test-session-123',
  submitted_at: new Date(),
  created_at: new Date(),
};

const fakePolitician = { id: 'pol-uuid-1' };

const fakeMatchResult = {
  id: 'mr-uuid-1',
  profile_id: '07000000-0000-0000-0000-000000000001',
  politician_id: 'pol-uuid-1',
  score: '75.00',
  breakdown: { healthcare: 80 },
  computed_at: new Date(),
  first_name: 'Alice',
  last_name: 'Anderson',
  party: 'Democrat',
  state: 'CA',
  chamber: 'senate' as const,
  image_url: null,
  bioguide_id: 'A000001',
  total_votes: 3,
};

describe('createQuestionnaireRepository', () => {
  describe('listPolicyTags', () => {
    it('returns all policy tags', async () => {
      const pool = makePoolMock({ 'FROM policy_tags': [fakeTag] });
      const repo = createQuestionnaireRepository(pool);
      const tags = await repo.listPolicyTags();
      expect(tags).toHaveLength(1);
      expect(tags[0]?.slug).toBe('healthcare');
    });

    it('returns empty array when no tags', async () => {
      const pool = makePoolMock();
      const repo = createQuestionnaireRepository(pool);
      const tags = await repo.listPolicyTags();
      expect(tags).toHaveLength(0);
    });
  });

  describe('getProfileBySessionId', () => {
    it('returns the profile when found', async () => {
      const pool = makePoolMock({ 'WHERE session_id': [fakeProfile] });
      const repo = createQuestionnaireRepository(pool);
      const profile = await repo.getProfileBySessionId('test-session-123');
      expect(profile).not.toBeNull();
      expect(profile?.session_id).toBe('test-session-123');
    });

    it('returns null when not found', async () => {
      const pool = makePoolMock();
      const repo = createQuestionnaireRepository(pool);
      const profile = await repo.getProfileBySessionId('nonexistent');
      expect(profile).toBeNull();
    });
  });

  describe('upsertProfile', () => {
    it('returns the upserted profile', async () => {
      const pool = makePoolMock({ 'RETURNING': [fakeProfile] });
      const repo = createQuestionnaireRepository(pool);
      const profile = await repo.upsertProfile('test-session-123');
      expect(profile.session_id).toBe('test-session-123');
    });

    it('calls INSERT ... ON CONFLICT', async () => {
      const pool = makePoolMock({ 'RETURNING': [fakeProfile] });
      const repo = createQuestionnaireRepository(pool);
      await repo.upsertProfile('test-session-123');
      const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
      expect(call[0]).toContain('ON CONFLICT');
      expect(call[0]).toContain('submitted_at');
    });
  });

  describe('upsertAnswers', () => {
    it('does nothing when responses array is empty', async () => {
      const pool = makePoolMock();
      const repo = createQuestionnaireRepository(pool);
      await repo.upsertAnswers('prof-id', []);
      expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });

    it('looks up tag IDs and inserts answers', async () => {
      const pool = makePoolMock({ 'WHERE slug': [fakeTag] });
      const repo = createQuestionnaireRepository(pool);
      await repo.upsertAnswers('prof-id', [{ tagSlug: 'healthcare', stance: 'support' }]);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      // First call: fetch tag IDs
      expect(calls[0]![0]).toContain('policy_tags');
      // Second call: upsert answer
      expect(calls[1]![0]).toContain('questionnaire_answers');
      expect(calls[1]![1]).toContain('support');
    });

    it('skips responses whose tag slug is not found', async () => {
      // Pool returns no tags.
      const pool = makePoolMock({ 'WHERE slug': [] });
      const repo = createQuestionnaireRepository(pool);
      await repo.upsertAnswers('prof-id', [{ tagSlug: 'unknown-tag', stance: 'support' }]);
      // Only one query (the tag lookup) should be made.
      expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    });
  });

  describe('computeAndSaveMatchResults', () => {
    it('upserts match results for each politician', async () => {
      // Return one politician, one voting data row
      const votingRow = {
        politician_id: 'pol-uuid-1',
        tag_slug: 'healthcare',
        stance: 'support',
        vote_value: 'yea',
        vote_count: '2',
      };
      const pool = makePoolMock({
        'FROM questionnaire_answers': [votingRow],
        'FROM politicians': [fakePolitician],
      });
      const repo = createQuestionnaireRepository(pool);
      await repo.computeAndSaveMatchResults('prof-uuid-1');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      // At minimum we expect calls for voting data, politicians list, and upsert
      expect(calls.length).toBeGreaterThanOrEqual(3);
      // Last call should be the match_results upsert
      const upsertCall = calls[calls.length - 1]!;
      expect(upsertCall[0]).toContain('match_results');
    });

    it('defaults to score 50 when no relevant votes exist', async () => {
      const pool = makePoolMock({
        'FROM questionnaire_answers': [],          // no voting data
        'FROM politicians': [fakePolitician],
      });
      const repo = createQuestionnaireRepository(pool);
      await repo.computeAndSaveMatchResults('prof-uuid-1');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      const upsertCall = calls[calls.length - 1]!;
      // score param is index 2 (0-based $3)
      expect(upsertCall[1]![2]).toBe('50.00');
    });

    it('computes 100% score when user supports and politician always voted yea', async () => {
      const votingRow = {
        politician_id: 'pol-uuid-1',
        tag_slug: 'healthcare',
        stance: 'strongly-support',  // weight = 2
        vote_value: 'yea',           // direction = +1  → raw = 2, max = 2
        vote_count: '5',
      };
      const pool = makePoolMock({
        'FROM questionnaire_answers': [votingRow],
        'FROM politicians': [fakePolitician],
      });
      const repo = createQuestionnaireRepository(pool);
      await repo.computeAndSaveMatchResults('prof-uuid-1');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      const upsertCall = calls[calls.length - 1]!;
      // (2/2 + 1) / 2 * 100 = 100
      expect(upsertCall[1]![2]).toBe('100.00');
    });

    it('computes 0% score when user supports and politician always voted nay', async () => {
      const votingRow = {
        politician_id: 'pol-uuid-1',
        tag_slug: 'healthcare',
        stance: 'strongly-support', // weight = 2
        vote_value: 'nay',          // direction = -1  → raw = -2, max = 2
        vote_count: '3',
      };
      const pool = makePoolMock({
        'FROM questionnaire_answers': [votingRow],
        'FROM politicians': [fakePolitician],
      });
      const repo = createQuestionnaireRepository(pool);
      await repo.computeAndSaveMatchResults('prof-uuid-1');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      const upsertCall = calls[calls.length - 1]!;
      // (-2/2 + 1) / 2 * 100 = 0
      expect(upsertCall[1]![2]).toBe('0.00');
    });

    it('computes 100% score when user opposes and politician always voted nay', async () => {
      const votingRow = {
        politician_id: 'pol-uuid-1',
        tag_slug: 'immigration',
        stance: 'strongly-oppose', // weight = -2
        vote_value: 'nay',         // direction = -1  → raw = (-2)*(-1) = 2, max = 2
        vote_count: '4',
      };
      const pool = makePoolMock({
        'FROM questionnaire_answers': [votingRow],
        'FROM politicians': [fakePolitician],
      });
      const repo = createQuestionnaireRepository(pool);
      await repo.computeAndSaveMatchResults('prof-uuid-1');

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as [string, unknown[]][];
      const upsertCall = calls[calls.length - 1]!;
      expect(upsertCall[1]![2]).toBe('100.00');
    });
  });

  describe('getMatchResultsBySessionId', () => {
    it('returns ranked match results with politician info', async () => {
      const pool = makePoolMock({ 'FROM match_results': [fakeMatchResult] });
      const repo = createQuestionnaireRepository(pool);
      const results = await repo.getMatchResultsBySessionId('test-session-123');
      expect(results).toHaveLength(1);
      expect(results[0]?.score).toBe('75.00');
      expect(results[0]?.first_name).toBe('Alice');
    });

    it('returns empty array when no results exist', async () => {
      const pool = makePoolMock();
      const repo = createQuestionnaireRepository(pool);
      const results = await repo.getMatchResultsBySessionId('unknown-session');
      expect(results).toHaveLength(0);
    });
  });
});
