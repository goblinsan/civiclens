-- Migration: 006_vote_source_updated_at
-- Description: Record the upstream "last updated" timestamp of each roll-call
--              vote so the ingest job can skip re-fetching member positions
--              for votes whose source record has not changed. Congress.gov
--              exposes this as updateDate on house-vote list items; sources
--              without such a field leave it NULL and are always re-fetched.

ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;
