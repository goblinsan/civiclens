/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Tracks request timestamps per key and rejects requests that exceed the
 * configured limit within the rolling time window.  Suitable for single-process
 * deployments; replace with a distributed store (Redis) for multi-instance.
 */

/** Number of requests allowed within the window. */
const WINDOW_LIMIT = 10;

/** Window duration in milliseconds (15 minutes). */
const WINDOW_MS = 15 * 60 * 1000;

/** Number of requests in a short burst that triggers a "suspicious" flag. */
const BURST_LIMIT = 5;

/** Short burst window in milliseconds (1 minute). */
const BURST_WINDOW_MS = 60 * 1000;

interface WindowEntry {
  /** Unix-ms timestamps of each request within the current window. */
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

/**
 * Check whether `key` has exceeded the rate limit.
 *
 * @returns `{ limited: boolean; suspicious: boolean }`
 *   - `limited` – true when the long-window limit is exceeded (reject the request)
 *   - `suspicious` – true when the short burst limit is exceeded (worth logging)
 */
export function checkRateLimit(key: string): { limited: boolean; suspicious: boolean } {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Prune timestamps outside the long window.
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  const limited = entry.timestamps.length >= WINDOW_LIMIT;

  // Still record the attempt for logging purposes even when limited.
  if (!limited) {
    entry.timestamps.push(now);
  }
  store.set(key, entry);

  // Count requests within the short burst window.
  const burstCount = entry.timestamps.filter((t) => now - t < BURST_WINDOW_MS).length;
  const suspicious = burstCount >= BURST_LIMIT;

  return { limited, suspicious };
}
