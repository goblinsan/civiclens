-- Migration: 007_bill_source_updated_at
-- Description: Record Congress.gov's updateDate for each bill so the ingest
--              job can skip re-fetching detail, summaries and subjects for
--              bills whose source record has not changed. This is what lets a
--              full backfill of a congress (~15k bills, three requests each)
--              proceed across several capped runs instead of re-fetching the
--              same most-recently-updated bills every time.

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;
