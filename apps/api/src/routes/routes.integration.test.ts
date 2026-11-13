/**
 * Integration tests for critical API flows.
 *
 * These tests exercise the full Fastify request/response cycle using
 * app.inject() with a mocked database pool.  They cover the flows
 * specified in issue #51: list bills, bill detail, politician detail,
 * questionnaire submit and match calculate.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { DbPool } from '@civreveal/db';

// ─── Shared mock data ─────────────────────────────────────────────────────────

const fakeBill = {
  id: 'bill-uuid-1',
  congress: 119,
  bill_type: 'HR',
  bill_number: '100',
  title: 'Test Bill',
  summary: 'A test bill.',
  status: 'committee',
  sponsor_id: 'pol-uuid-1',
  introduced_at: new Date('2025-01-01'),
  created_at: new Date(),
  updated_at: new Date(),
  sponsor_first_name: 'Alice',
  sponsor_last_name: 'Anderson',
  tags: ['healthcare'],
};

const fakePolitician = {
  id: 'pol-uuid-1',
  bioguide_id: 'A000001',
  first_name: 'Alice',
  last_name: 'Anderson',
  party: 'Democrat',
  state: 'CA',
  chamber: 'senate',
  district: null,
  image_url: null,
  website: null,
  office_id: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const fakeProfile = {
  id: 'profile-uuid-1',
  session_id: 'test-session-abc',
  submitted_at: new Date(),
  created_at: new Date(),
};


// ─── Pool mock helpers ────────────────────────────────────────────────────────

/**
 * Pattern-based pool mock: for each query, the first matching pattern wins.
 * Falls back to empty rows when no pattern matches.
 */
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
    connect: vi.fn(),
  };
  return mock as unknown as DbPool;
}

// ─── GET /bills ───────────────────────────────────────────────────────────────

describe('GET /bills', () => {
  it('returns paginated bill list', async () => {
    const pool = makePoolMock({
      'COUNT(*)': [{ count: '1' }],
      'GROUP BY': [fakeBill],
    });
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/bills' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
  });

  it('returns 400 for invalid query parameters', async () => {
    const pool = makePoolMock();
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/bills?page=bad' });
    expect(res.statusCode).toBe(400);
  });

  it('returns empty list when no bills exist', async () => {
    const pool = makePoolMock({ 'COUNT(*)': [{ count: '0' }] });
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/bills' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ total: number; data: unknown[] }>();
    expect(body.total).toBe(0);
    expect(body.data).toHaveLength(0);
  });
});

// ─── GET /bills/:id ───────────────────────────────────────────────────────────

describe('GET /bills/:id', () => {
  it('returns the bill when found', async () => {
    const pool = makePoolMock({ 'WHERE b.id': [fakeBill] });
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/bills/bill-uuid-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json<typeof fakeBill>();
    expect(body.id).toBe('bill-uuid-1');
    expect(body.title).toBe('Test Bill');
  });

  it('returns 404 when bill is not found', async () => {
    const pool = makePoolMock();
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/bills/nonexistent' });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: { message: string } }>();
    expect(body.error.message).toBe('Bill not found');
  });
});

// ─── GET /politicians/:id ─────────────────────────────────────────────────────

describe('GET /politicians/:id', () => {
  it('returns the politician when found', async () => {
    const pool = makePoolMock({ 'WHERE id': [fakePolitician] });
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/politicians/pol-uuid-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json<typeof fakePolitician>();
    expect(body.id).toBe('pol-uuid-1');
    expect(body.bioguide_id).toBe('A000001');
  });

  it('returns 404 when politician is not found', async () => {
    const pool = makePoolMock();
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/politicians/nonexistent' });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: { message: string } }>();
    expect(body.error.message).toBe('Politician not found');
  });
});

// ─── GET /questionnaire/goals ─────────────────────────────────────────────────

describe('GET /questionnaire/goals', () => {
  it('groups active goals by area in sort order', async () => {
    const pool = makePoolMock({
      'FROM policy_goals WHERE is_active': [
        { slug: 'energy-nuclear-expand', area_slug: 'energy', area_label: 'Energy', statement: 'Expand nuclear power generation', legislation_note: 'funds reactors', sort_order: 1 },
        { slug: 'energy-grid-invest', area_slug: 'energy', area_label: 'Energy', statement: 'Increase federal investment in the electric grid and energy storage', legislation_note: 'transmission funding', sort_order: 2 },
        { slug: 'housing-vouchers-expand', area_slug: 'housing', area_label: 'Housing', statement: 'Expand rental assistance and housing vouchers', legislation_note: 'Section 8', sort_order: 3 },
      ],
    });
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/questionnaire/goals' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ areas: Array<{ slug: string; goals: unknown[] }> }>();
    expect(body.areas.map((a) => a.slug)).toEqual(['energy', 'housing']);
    expect(body.areas[0]!.goals).toHaveLength(2);
  });
});

// ─── POST /questionnaire/submit ───────────────────────────────────────────────

describe('POST /questionnaire/submit', () => {
  it('returns 200 with sessionId, profileId and the number of answers stored', async () => {
    const pool = makePoolMock({
      'INSERT INTO questionnaire_profiles': [fakeProfile],
      'INSERT INTO questionnaire_goal_answers': [{}],
    });
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'POST',
      url: '/questionnaire/submit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test-session-abc',
        answers: [{ goal: 'energy-nuclear-expand', stance: 'support', importance: 3 }],
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ sessionId: string; profileId: string; answered: number }>();
    expect(body).toEqual({ sessionId: 'test-session-abc', profileId: 'profile-uuid-1', answered: 1 });
  });

  it('returns 400 when body is invalid', async () => {
    const app = await buildApp({ pool: makePoolMock() });
    const res = await app.inject({
      method: 'POST',
      url: '/questionnaire/submit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: '' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when answers array is empty or the stance is unknown', async () => {
    const app = await buildApp({ pool: makePoolMock() });
    for (const answers of [[], [{ goal: 'x', stance: 'neutral' }]]) {
      const res = await app.inject({
        method: 'POST',
        url: '/questionnaire/submit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'test-session-abc', answers }),
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('returns 400 when no answer names a known goal', async () => {
    const pool = makePoolMock({ 'INSERT INTO questionnaire_profiles': [fakeProfile] });
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'POST',
      url: '/questionnaire/submit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test-session-abc', answers: [{ goal: 'no-such-goal', stance: 'support' }] }),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── GET /questionnaire/matches ───────────────────────────────────────────────

describe('GET /questionnaire/matches', () => {
  it('returns match results when session exists', async () => {
    const fakeMatch = {
      id: 'mr-uuid-1',
      profile_id: 'profile-uuid-1',
      politician_id: 'pol-uuid-1',
      score: '75.00',
      breakdown: { model: 'goals-v1', goals: { 'energy-nuclear-expand': { score: 80, votes: 3, agreed: 2 } }, _total_votes: 3 },
      computed_at: new Date(),
      first_name: 'Alice',
      last_name: 'Anderson',
      party: 'Democrat',
      state: 'CA',
      chamber: 'senate',
      image_url: null,
      bioguide_id: 'A000001',
      total_votes: 3,
    };
    const pool = makePoolMock({
      'questionnaire_profiles WHERE session_id': [fakeProfile],
      'FROM match_results': [fakeMatch],
    });
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/questionnaire/matches?sessionId=test-session-abc' });
    expect(res.statusCode).toBe(200);
    expect(res.json<unknown[]>()).toHaveLength(1);
  });

  it('returns 404 when session has no profile', async () => {
    const app = await buildApp({ pool: makePoolMock() });
    const res = await app.inject({ method: 'GET', url: '/questionnaire/matches?sessionId=unknown-session' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when sessionId is missing', async () => {
    const app = await buildApp({ pool: makePoolMock() });
    const res = await app.inject({ method: 'GET', url: '/questionnaire/matches' });
    expect(res.statusCode).toBe(400);
  });

  it('serves the votes that counted for one politician', async () => {
    const pool = makePoolMock({
      'questionnaire_profiles WHERE session_id': [fakeProfile],
      'AS agreed': [{ vote_id: 'v1', bill_type: 'HR', bill_number: '1', goal_slug: 'energy-nuclear-expand', position: 'yea', agreed: true }],
    });
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'GET',
      url: '/questionnaire/matches/pol-uuid-1/evidence?sessionId=test-session-abc',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<Array<{ agreed: boolean }>>()[0]!.agreed).toBe(true);
  });
});

// ─── GET /bills/:id/analysis ──────────────────────────────────────────────────

describe('GET /bills/:id/analysis', () => {
  it('returns codings and the brief, empty when none exist', async () => {
    const app = await buildApp({ pool: makePoolMock() });
    const res = await app.inject({ method: 'GET', url: '/bills/bill-uuid-1/analysis' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ effects: [], brief: null });
  });
});
