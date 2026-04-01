-- Migration: 002_vote_source_ids
-- Description: Add source_id to votes table to support idempotent ingestion.
--              A partial unique index allows legacy rows (source_id IS NULL) while
--              enforcing uniqueness among ingested rows.

ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_source_id
  ON votes (source_id)
  WHERE source_id IS NOT NULL;
