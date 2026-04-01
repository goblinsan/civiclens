import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

/**
 * Runs any SQL migration files in `migrationsDir` that have not yet been
 * recorded in the `schema_migrations` bookkeeping table.
 *
 * Migration files must be named `NNN_description.sql` (e.g. `001_initial_schema.sql`).
 * They are applied in ascending lexicographic order and each is wrapped in a
 * single transaction so a failure leaves the database unchanged.
 */
export async function migrate(
  pool: InstanceType<typeof Pool>,
  migrationsDir: string,
): Promise<void> {
  // Ensure the bookkeeping table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT        PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Discover migration files
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // Load already-applied versions
  const { rows } = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  const applied = new Set(rows.map((r) => r.version));

  for (const file of files) {
    if (applied.has(file)) continue;

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] Applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration failed for ${file}: ${String(err)}`);
    } finally {
      client.release();
    }
  }
}
