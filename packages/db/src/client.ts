import pg from 'pg';

const { Pool } = pg;

let _pool: InstanceType<typeof Pool> | null = null;
let _poolUrl: string | null = null;

/**
 * Returns a singleton Pool for the given DATABASE_URL.
 * Calling getPool() multiple times with the same URL returns the same instance.
 * Calling with a different URL after the pool has been created throws an error —
 * call closePool() first if you need to reconnect to a different database.
 * Tests should call closePool() in afterAll to release connections.
 */
export function getPool(databaseUrl: string): InstanceType<typeof Pool> {
  if (_pool) {
    if (_poolUrl !== databaseUrl) {
      throw new Error(
        'getPool() was called with a different DATABASE_URL after the pool was already created. ' +
          'Call closePool() before switching databases.',
      );
    }
    return _pool;
  }
  _pool = new Pool({ connectionString: databaseUrl });
  _poolUrl = databaseUrl;
  return _pool;
}

/** Close and discard the current pool (useful in tests and graceful shutdown). */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _poolUrl = null;
  }
}
