import pg from 'pg';

const { Pool } = pg;

let _pool: InstanceType<typeof Pool> | null = null;

/**
 * Returns a singleton Pool for the given DATABASE_URL.
 * Calling getPool() multiple times with the same URL returns the same instance.
 * Tests should call closePool() in afterAll to release connections.
 */
export function getPool(databaseUrl: string): InstanceType<typeof Pool> {
  if (!_pool) {
    _pool = new Pool({ connectionString: databaseUrl });
  }
  return _pool;
}

/** Close and discard the current pool (useful in tests and graceful shutdown). */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
