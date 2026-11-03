/**
 * user-agent.ts
 *
 * The one identity the ingest job presents to upstream servers. Registered
 * with bot-management vendors (Akamai, for senate.gov) under exactly this
 * product token, so change it only together with that registration and the
 * public bot page it points at.
 */

export const BOT_NAME = 'CivRevealBot';
export const BOT_VERSION = '1.0';
/** Human-readable description of the bot: purpose, schedule, verification, contact. */
export const BOT_INFO_URL = 'https://civreveal.org/bot';

export const USER_AGENT = `${BOT_NAME}/${BOT_VERSION} (+${BOT_INFO_URL})`;
