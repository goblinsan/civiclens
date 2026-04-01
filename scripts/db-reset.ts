/**
 * Database reset script — for local development only.
 *
 * Drops all application tables (including schema_migrations), then runs
 * migrations from scratch to give a clean slate.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm db:reset
 *
 * To also populate seed data after reset:
 *   DATABASE_URL=postgres://... pnpm db:reset && pnpm db:seed
 *
 * ⚠️  Never run this against a production database.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '@civiclens/db';

const { Pool } = pg;

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/civiclens';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../db/migrations');

const pool = new Pool({ connectionString: DATABASE_URL });

const DROP_TABLES = `
  DROP TABLE IF EXISTS
    audit_logs,
    raw_payloads,
    sentiment_submissions,
    match_results,
    questionnaire_answers,
    questionnaire_profiles,
    vote_records,
    votes,
    bill_tags,
    bill_versions,
    bills,
    policy_tags,
    politicians,
    offices,
    jurisdictions,
    schema_migrations
  CASCADE
`;

async function reset() {
  console.log('[db-reset] Dropping existing tables…');
  await pool.query(DROP_TABLES);
  console.log('[db-reset] Tables dropped.');

  await migrate(pool, migrationsDir);
  console.log('[db-reset] ✅ Schema created. Run "pnpm db:seed" to load fixture data.');
}

reset()
  .then(() => pool.end())
  .catch((err: unknown) => {
    console.error('[db-reset] ❌ Reset failed:', err);
    process.exit(1);
  });
