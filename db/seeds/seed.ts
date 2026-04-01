/**
 * Seed script: inserts repeatable local dev fixture data.
 *
 * Run with:  pnpm --filter @civiclens/db seed
 *         or via the top-level script:  pnpm db:seed
 *
 * The script is idempotent – it uses INSERT … ON CONFLICT DO NOTHING so it
 * can be run multiple times without creating duplicate rows.
 */
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/civiclens';

const pool = new Pool({ connectionString: DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Policy tags ──────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO policy_tags (id, slug, label) VALUES
        ('01000000-0000-0000-0000-000000000001', 'healthcare',     'Healthcare'),
        ('01000000-0000-0000-0000-000000000002', 'education',      'Education'),
        ('01000000-0000-0000-0000-000000000003', 'environment',    'Environment'),
        ('01000000-0000-0000-0000-000000000004', 'economy',        'Economy'),
        ('01000000-0000-0000-0000-000000000005', 'defense',        'Defense'),
        ('01000000-0000-0000-0000-000000000006', 'immigration',    'Immigration'),
        ('01000000-0000-0000-0000-000000000007', 'housing',        'Housing'),
        ('01000000-0000-0000-0000-000000000008', 'infrastructure', 'Infrastructure'),
        ('01000000-0000-0000-0000-000000000009', 'civil-rights',   'Civil Rights'),
        ('01000000-0000-0000-0000-000000000010', 'foreign-policy', 'Foreign Policy')
      ON CONFLICT (slug) DO NOTHING
    `);

    // ── Jurisdictions ────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO jurisdictions (id, type, name, code) VALUES
        ('02000000-0000-0000-0000-000000000001', 'federal', 'United States', 'US'),
        ('02000000-0000-0000-0000-000000000002', 'state',   'California',    'CA'),
        ('02000000-0000-0000-0000-000000000003', 'state',   'Texas',         'TX')
      ON CONFLICT (type, code) DO NOTHING
    `);

    // ── Politicians ──────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO politicians
        (id, bioguide_id, first_name, last_name, party, state, chamber, district)
      VALUES
        ('03000000-0000-0000-0000-000000000001', 'A000001', 'Alice',   'Anderson', 'Democrat',   'CA', 'senate', NULL),
        ('03000000-0000-0000-0000-000000000002', 'B000002', 'Bob',     'Baker',    'Republican', 'TX', 'senate', NULL),
        ('03000000-0000-0000-0000-000000000003', 'C000003', 'Carol',   'Chen',     'Democrat',   'CA', 'house',  12),
        ('03000000-0000-0000-0000-000000000004', 'D000004', 'David',   'Davis',    'Republican', 'TX', 'house',  3)
      ON CONFLICT (bioguide_id) DO NOTHING
    `);

    // ── Bills ────────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO bills
        (id, congress, bill_type, bill_number, title, summary, status, sponsor_id, introduced_at)
      VALUES
        (
          '04000000-0000-0000-0000-000000000001',
          118, 'HR', '1234',
          'Affordable Care Expansion Act',
          'Expands Medicaid eligibility thresholds and subsidizes premiums for low-income families.',
          'committee',
          '03000000-0000-0000-0000-000000000001',
          '2023-02-15T00:00:00Z'
        ),
        (
          '04000000-0000-0000-0000-000000000002',
          118, 'S', '567',
          'Clean Energy Investment Act',
          'Authorizes $500 billion in green infrastructure spending over ten years.',
          'floor',
          '03000000-0000-0000-0000-000000000001',
          '2023-03-01T00:00:00Z'
        ),
        (
          '04000000-0000-0000-0000-000000000003',
          118, 'HR', '8901',
          'Border Security Enhancement Act',
          'Increases funding for border patrol personnel and physical infrastructure.',
          'passed-house',
          '03000000-0000-0000-0000-000000000004',
          '2023-04-10T00:00:00Z'
        ),
        (
          '04000000-0000-0000-0000-000000000004',
          118, 'S', '234',
          'Housing Affordability and Zoning Reform Act',
          'Creates incentives for local governments to loosen single-family zoning restrictions.',
          'introduced',
          '03000000-0000-0000-0000-000000000002',
          '2023-05-20T00:00:00Z'
        ),
        (
          '04000000-0000-0000-0000-000000000005',
          118, 'HR', '5678',
          'Bipartisan Infrastructure Maintenance Act',
          'Directs $200 billion toward road, bridge, and broadband repair programs.',
          'signed',
          '03000000-0000-0000-0000-000000000003',
          '2023-01-05T00:00:00Z'
        )
      ON CONFLICT (congress, bill_type, bill_number) DO NOTHING
    `);

    // ── Bill tags ────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO bill_tags (bill_id, policy_tag_id) VALUES
        ('04000000-0000-0000-0000-000000000001', '01000000-0000-0000-0000-000000000001'),
        ('04000000-0000-0000-0000-000000000002', '01000000-0000-0000-0000-000000000003'),
        ('04000000-0000-0000-0000-000000000002', '01000000-0000-0000-0000-000000000004'),
        ('04000000-0000-0000-0000-000000000003', '01000000-0000-0000-0000-000000000006'),
        ('04000000-0000-0000-0000-000000000004', '01000000-0000-0000-0000-000000000007'),
        ('04000000-0000-0000-0000-000000000005', '01000000-0000-0000-0000-000000000008')
      ON CONFLICT DO NOTHING
    `);

    // ── Votes ────────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO votes
        (id, bill_id, chamber, vote_date, result, yea_count, nay_count, abstain_count, not_voting_count)
      VALUES
        (
          '05000000-0000-0000-0000-000000000001',
          '04000000-0000-0000-0000-000000000003',
          'house', '2023-06-15T14:00:00Z',
          'passed', 220, 210, 2, 3
        ),
        (
          '05000000-0000-0000-0000-000000000002',
          '04000000-0000-0000-0000-000000000005',
          'house', '2022-11-10T15:30:00Z',
          'passed', 300, 120, 5, 10
        ),
        (
          '05000000-0000-0000-0000-000000000003',
          '04000000-0000-0000-0000-000000000005',
          'senate', '2022-11-18T16:00:00Z',
          'passed', 68, 30, 0, 2
        )
      ON CONFLICT (id) DO NOTHING
    `);

    // ── Vote records ─────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO vote_records (id, vote_id, politician_id, value) VALUES
        ('06000000-0000-0000-0000-000000000001', '05000000-0000-0000-0000-000000000001', '03000000-0000-0000-0000-000000000003', 'yea'),
        ('06000000-0000-0000-0000-000000000002', '05000000-0000-0000-0000-000000000001', '03000000-0000-0000-0000-000000000004', 'yea'),
        ('06000000-0000-0000-0000-000000000003', '05000000-0000-0000-0000-000000000002', '03000000-0000-0000-0000-000000000003', 'yea'),
        ('06000000-0000-0000-0000-000000000004', '05000000-0000-0000-0000-000000000002', '03000000-0000-0000-0000-000000000004', 'nay'),
        ('06000000-0000-0000-0000-000000000005', '05000000-0000-0000-0000-000000000003', '03000000-0000-0000-0000-000000000001', 'yea'),
        ('06000000-0000-0000-0000-000000000006', '05000000-0000-0000-0000-000000000003', '03000000-0000-0000-0000-000000000002', 'nay')
      ON CONFLICT (vote_id, politician_id) DO NOTHING
    `);

    // ── Questionnaire profiles ────────────────────────────────────────────────
    await client.query(`
      INSERT INTO questionnaire_profiles (id, session_id) VALUES
        ('07000000-0000-0000-0000-000000000001', 'dev-session-alpha'),
        ('07000000-0000-0000-0000-000000000002', 'dev-session-beta')
      ON CONFLICT (session_id) DO NOTHING
    `);

    // ── Questionnaire answers ─────────────────────────────────────────────────
    await client.query(`
      INSERT INTO questionnaire_answers (id, profile_id, policy_tag_id, stance) VALUES
        ('08000000-0000-0000-0000-000000000001', '07000000-0000-0000-0000-000000000001', '01000000-0000-0000-0000-000000000001', 'strongly-support'),
        ('08000000-0000-0000-0000-000000000002', '07000000-0000-0000-0000-000000000001', '01000000-0000-0000-0000-000000000003', 'support'),
        ('08000000-0000-0000-0000-000000000003', '07000000-0000-0000-0000-000000000001', '01000000-0000-0000-0000-000000000006', 'oppose'),
        ('08000000-0000-0000-0000-000000000004', '07000000-0000-0000-0000-000000000002', '01000000-0000-0000-0000-000000000005', 'support'),
        ('08000000-0000-0000-0000-000000000005', '07000000-0000-0000-0000-000000000002', '01000000-0000-0000-0000-000000000006', 'strongly-oppose')
      ON CONFLICT (profile_id, policy_tag_id) DO NOTHING
    `);

    // ── Match results ─────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO match_results (id, profile_id, politician_id, score, breakdown) VALUES
        (
          '09000000-0000-0000-0000-000000000001',
          '07000000-0000-0000-0000-000000000001',
          '03000000-0000-0000-0000-000000000001',
          85.50,
          '{"healthcare": 90, "environment": 80, "immigration": 60}'
        ),
        (
          '09000000-0000-0000-0000-000000000002',
          '07000000-0000-0000-0000-000000000001',
          '03000000-0000-0000-0000-000000000002',
          42.00,
          '{"healthcare": 30, "environment": 20, "immigration": 75}'
        ),
        (
          '09000000-0000-0000-0000-000000000003',
          '07000000-0000-0000-0000-000000000002',
          '03000000-0000-0000-0000-000000000002',
          78.00,
          '{"defense": 85, "immigration": 90}'
        )
      ON CONFLICT (profile_id, politician_id) DO NOTHING
    `);

    // ── Sentiment submissions ─────────────────────────────────────────────────
    await client.query(`
      INSERT INTO sentiment_submissions (id, bill_id, session_id, sentiment) VALUES
        ('10000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000001', 'dev-session-alpha', 'support'),
        ('10000000-0000-0000-0000-000000000002', '04000000-0000-0000-0000-000000000002', 'dev-session-alpha', 'support'),
        ('10000000-0000-0000-0000-000000000003', '04000000-0000-0000-0000-000000000003', 'dev-session-alpha', 'oppose'),
        ('10000000-0000-0000-0000-000000000004', '04000000-0000-0000-0000-000000000003', 'dev-session-beta',  'support')
      ON CONFLICT (bill_id, session_id) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('[seed] ✅ Fixture data inserted successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[seed] ❌ Fatal error:', err);
  process.exit(1);
});
