-- Migration: 008_politicians_is_current
-- Description: Distinguish sitting members from former ones. The roster ingest
--              only loads current members, so bills sponsored by someone who
--              has since left Congress were dropped; the ingest job now fetches
--              such sponsors on demand and records them as former members, and
--              marks anyone missing from a fresh roster as former. The directory
--              and match rankings show sitting members by default; former
--              members keep their own page and voting record.

ALTER TABLE politicians
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_politicians_is_current ON politicians (is_current);
