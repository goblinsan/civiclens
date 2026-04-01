/**
 * Migration runner script.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm db:migrate
 *
 * Applies any SQL files in db/migrations/ that haven't been applied yet.
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

migrate(pool, migrationsDir)
  .then(() => {
    console.log('[migrate] ✅ All migrations up to date.');
    return pool.end();
  })
  .catch((err: unknown) => {
    console.error('[migrate] ❌ Migration failed:', err);
    process.exit(1);
  });
