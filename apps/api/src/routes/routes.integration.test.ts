/**
 * Integration tests for critical API flows.
 *
 * These tests exercise the full Fastify request/response cycle using
 * app.inject() with a mocked database pool.  They cover the flows
 * specified in issue #51: list bills, bill detail, politician detail,
 * questionnaire submit, match calculate, and sentiment submit.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { DbPool } from '@civiclens/db';

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

const fakeTag = {
  id: 'tag-uuid-1',
  slug: 'healthcare',
  label: 'Healthcare',
};

const fakeSentiment = {
  id: 'sentiment-uuid-1',
  bill_id: 'bill-uuid-1',
  session_id: 'test-session-abc',
  sentiment: 'support',
  submitted_at: new Date(),
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

// ─── POST /questionnaire/submit ───────────────────────────────────────────────

describe('POST /questionnaire/submit', () => {
  it('returns 200 with sessionId and profileId on valid submission', async () => {
    const pool = makePoolMock({
      'INSERT INTO questionnaire_profiles': [fakeProfile],  // upsertProfile RETURNING
      'WHERE slug = ANY': [fakeTag],                        // upsertAnswers tag lookup
    });
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'POST',
      url: '/questionnaire/submit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test-session-abc',
        responses: [{ tag: 'healthcare', stance: 'support' }],
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ sessionId: string; profileId: string }>();
    expect(body.sessionId).toBe('test-session-abc');
    expect(body.profileId).toBe('profile-uuid-1');
  });

  it('returns 400 when body is invalid', async () => {
    const pool = makePoolMock();
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'POST',
      url: '/questionnaire/submit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: '' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when responses array is empty', async () => {
    const pool = makePoolMock();
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'POST',
      url: '/questionnaire/submit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test-session-abc', responses: [] }),
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
      breakdown: { healthcare: 80 },
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
    const res = await app.inject({
      method: 'GET',
      url: '/questionnaire/matches?sessionId=test-session-abc',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<unknown[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
  });

  it('returns 404 when session has no profile', async () => {
    const pool = makePoolMock();
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'GET',
      url: '/questionnaire/matches?sessionId=unknown-session',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when sessionId is missing', async () => {
    const pool = makePoolMock();
    const app = await buildApp({ pool });
    const res = await app.inject({ method: 'GET', url: '/questionnaire/matches' });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /bills/:id/sentiments ───────────────────────────────────────────────

describe('POST /bills/:id/sentiments', () => {
  it('returns 201 on successful sentiment submission', async () => {
    const pool = makePoolMock({
      'WHERE b.id': [fakeBill],
      'INSERT INTO sentiment_submissions': [fakeSentiment],
    });
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'POST',
      url: '/bills/bill-uuid-1/sentiments',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test-session-abc',
        sentiment: 'support',
      }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ sentiment: string }>();
    expect(body.sentiment).toBe('support');
  });

  it('returns 400 when body is invalid', async () => {
    const pool = makePoolMock();
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'POST',
      url: '/bills/bill-uuid-1/sentiments',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: '', sentiment: 'bad' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when bill does not exist', async () => {
    const pool = makePoolMock(); // returns empty for getBillById
    const app = await buildApp({ pool });
    const res = await app.inject({
      method: 'POST',
      url: '/bills/nonexistent/sentiments',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test-session-abc', sentiment: 'support' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when sentiment already submitted for this session', async () => {
    // Simulate a PostgreSQL unique-constraint violation for the sentiment INSERT.
    const uniqueViolation = Object.assign(new Error('unique violation'), { code: '23505' });
    const poolMock = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [fakeBill], rowCount: 1 })      // getBillById
        .mockRejectedValueOnce(uniqueViolation)                        // INSERT sentiment → 23505
        .mockResolvedValueOnce({ rows: [fakeSentiment], rowCount: 1 }) // SELECT existing
        .mockResolvedValue({ rows: [], rowCount: 0 }),                 // any further calls
      connect: vi.fn(),
    } as unknown as import('@civiclens/db').DbPool;
    const app = await buildApp({ pool: poolMock });
    const res = await app.inject({
      method: 'POST',
      url: '/bills/bill-uuid-1/sentiments',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test-session-abc', sentiment: 'support' }),
    });
    expect(res.statusCode).toBe(409);
  });
});
