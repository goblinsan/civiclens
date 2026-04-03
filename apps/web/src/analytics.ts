/**
 * Lightweight analytics module for CivicLens.
 *
 * Sends fire-and-forget POST requests to the analytics API.  Errors are
 * silently swallowed so analytics can never break the user experience.
 */

const ANALYTICS_URL = '/api/analytics/events';

/**
 * Track a product analytics event.  Safe to call anywhere — never throws.
 *
 * @param event      Machine-readable event name, e.g. "bill_detail_viewed"
 * @param properties Optional key/value context for the event
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  try {
    const body = JSON.stringify({ event, properties });
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon(ANALYTICS_URL, new Blob([body], { type: 'application/json' }));
    } else {
      void fetch(ANALYTICS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    }
  } catch {
    // Analytics failures must never break the UI.
  }
}
