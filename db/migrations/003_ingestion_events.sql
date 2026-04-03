-- Migration: 003_ingestion_events
-- Description: Adds ingestion_events table for tracking interpretation-sensitive
--              audit events beyond row-level mutations captured in audit_logs.
--
--              Covers:
--                - ingestion run start/complete/failure
--                - per-phase source fetch failures
--                - bill tag overrides (manual edits)
--                - bill summary revisions
--                - sentiment moderation blocks (rate limit, bot detection)

CREATE TABLE ingestion_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT        NOT NULL,   -- see event types below
  source      TEXT        NOT NULL,   -- 'ingest-congress', 'api', 'manual'
  entity_type TEXT,                   -- 'members', 'bills', 'senate_votes', 'house_votes', 'sentiment', etc.
  entity_id   TEXT,                   -- source_id, bill_id, session_id, etc.
  data        JSONB       NOT NULL DEFAULT '{}',  -- stats, error info, context
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supported event_type values (documentation only — no CHECK constraint so
-- new types can be added without a schema migration):
--   run_start        — ingestion pipeline started
--   run_complete     — ingestion pipeline finished successfully
--   run_failure      — ingestion pipeline aborted with an unhandled error
--   fetch_failure    — a source fetch (HTTP / XML) failed
--   tag_override     — a bill's policy tags were manually changed
--   summary_revision — a bill summary was manually edited or regenerated
--   sentiment_block  — a sentiment submission was rejected (rate limit / bot)

CREATE INDEX idx_ingestion_events_type     ON ingestion_events (event_type);
CREATE INDEX idx_ingestion_events_source   ON ingestion_events (source);
CREATE INDEX idx_ingestion_events_occurred ON ingestion_events (occurred_at DESC);
