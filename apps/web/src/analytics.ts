/**
 * Lightweight analytics module for CivReveal.
 *
 * Sends fire-and-forget POST requests to the analytics API.  Errors are
 * silently swallowed so analytics can never break the user experience.
 */

import { env } from './env';

const ANALYTICS_URL = `${env.API_BASE_URL}/analytics/events`;

/**
 * Track a product analytics event.  Safe to call anywhere — never throws.
 *
 * Sent with `fetch`, not `navigator.sendBeacon`: a beacon always carries
 * credentials, and a JSON body makes it a preflighted cross-origin request, so
 * the browser refuses it unless the API allows credentials. Analytics needs no
 * cookies, so the request omits them. `keepalive` lets it outlive the page, as
 * a beacon would.
 *
 * @param event      Machine-readable event name, e.g. "bill_detail_viewed"
 * @param properties Optional key/value context for the event
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  try {
    void fetch(ANALYTICS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, properties }),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {
      // Analytics failures must never break the UI.
    });
  } catch {
    // Analytics failures must never break the UI.
  }
}
