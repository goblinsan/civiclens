-- Migration: 004_bill_classification
-- Description: Store the official CRS classification of each bill (policy area
--              + legislative subjects) and record where each policy tag came from.
--
--              Before this migration nothing populated bill_tags except the dev
--              seed, so alignment scores were always "no data" on real
--              ingested data. The ingest job now derives tags from the official
--              classification (see docs/bill-tagging.md) and records the
--              provenance of every tag so it can be audited on the bill page.

-- Official classification assigned by the Congressional Research Service and
-- published on Congress.gov. policy_area is one term from a controlled list;
-- subjects is the list of legislative subject terms.
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS policy_area TEXT,
  ADD COLUMN IF NOT EXISTS subjects    TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_bills_policy_area ON bills (policy_area);

-- Tag provenance.
--   source      'policy-area' — derived from the bill's official policy area term
--               'subject'     — derived from one of its legislative subject terms
--               'manual'      — applied by hand; never removed by the ingest job
--   matched_on  the official term that produced the tag (NULL for manual tags)
ALTER TABLE bill_tags
  ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'manual'
                                      CHECK (source IN ('manual', 'policy-area', 'subject')),
  ADD COLUMN IF NOT EXISTS matched_on TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
