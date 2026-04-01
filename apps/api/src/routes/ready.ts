import { FastifyInstance } from 'fastify';
import type { DbPool } from '@civiclens/db';

// How often to probe the database in the background (ms).
const DB_PROBE_INTERVAL_MS = 10_000;

/**
 * Runs a lightweight DB connectivity probe on a fixed interval.
 * The result is cached so that the /ready handler never touches the database
 * directly (avoiding per-request DB access that could be abused).
 */
function startDbProbe(pool: DbPool, log: FastifyInstance['log']) {
  let dbOk = true;

  const probe = async () => {
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch (err) {
      dbOk = false;
      log.error({ err }, 'Database connectivity check failed');
    }
  };

  // Run immediately, then on the interval.
  void probe();
  const timer = setInterval(() => void probe(), DB_PROBE_INTERVAL_MS);
  // Allow the process to exit even if the timer is still active.
  timer.unref();

  return { isOk: () => dbOk };
}

export async function readyRoutes(app: FastifyInstance, opts: { pool?: DbPool | null }) {
  const probe = opts.pool ? startDbProbe(opts.pool, app.log) : null;

  app.get('/', async (_request, reply) => {
    if (probe && !probe.isOk()) {
      return reply.code(503).send({ status: 'unavailable', reason: 'database unreachable' });
    }
    return reply.code(200).send({ status: 'ready' });
  });
}
