-- Migration: 009_policy_goals
-- Description: Goal-based scoring. A policy goal is a concrete direction of
--              federal action (data/policy-goals.json); a bill is coded as
--              advancing or hindering a goal (data/bill-goal-effects/*.json);
--              a respondent supports or opposes goals with an importance.
--              Both reference lists are synced from the repository by
--              `pnpm db:sync-goals`, so merged = reviewed.
--
--              Also records each roll-call's question ("On Passage", "On
--              Motion to Recommit"…) so scoring can confine itself to votes
--              that decide a bill. House votes are marked for one re-fetch so
--              the column is backfilled by the next ingest run.

CREATE TABLE IF NOT EXISTS policy_goals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT        NOT NULL UNIQUE,
  area_slug        TEXT        NOT NULL,
  area_label       TEXT        NOT NULL,
  statement        TEXT        NOT NULL,
  legislation_note TEXT        NOT NULL,
  candidate_terms  TEXT[]      NOT NULL DEFAULT '{}',
  sort_order       INT         NOT NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_goals_area ON policy_goals (area_slug, sort_order);

CREATE TABLE IF NOT EXISTS bill_goal_effects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     UUID        NOT NULL REFERENCES bills(id)        ON DELETE CASCADE,
  goal_id     UUID        NOT NULL REFERENCES policy_goals(id) ON DELETE CASCADE,
  effect      TEXT        NOT NULL CHECK (effect IN ('advances', 'hinders')),
  strength    SMALLINT    NOT NULL CHECK (strength BETWEEN 1 AND 3),
  rationale   TEXT        NOT NULL,
  evidence    TEXT        NOT NULL,
  coded_by    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bill_id, goal_id)
);

CREATE INDEX IF NOT EXISTS idx_bill_goal_effects_goal ON bill_goal_effects (goal_id);

CREATE TABLE IF NOT EXISTS questionnaire_goal_answers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES questionnaire_profiles(id) ON DELETE CASCADE,
  goal_id     UUID        NOT NULL REFERENCES policy_goals(id)           ON DELETE CASCADE,
  stance      TEXT        NOT NULL CHECK (stance IN ('support', 'oppose')),
  importance  SMALLINT    NOT NULL DEFAULT 2 CHECK (importance BETWEEN 1 AND 3),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, goal_id)
);

ALTER TABLE votes ADD COLUMN IF NOT EXISTS question TEXT;

-- Backfill: make the next ingest re-fetch every House roll-call once so the
-- question is stored. Senate votes have none stored yet.
UPDATE votes SET source_updated_at = NULL WHERE chamber = 'house' AND question IS NULL;

-- Bill briefs: reviewed plain-language analysis of a bill's likely effects
-- (data/bill-briefs/*.json), one per bill, sections stored as JSON.
CREATE TABLE IF NOT EXISTS bill_briefs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id              UUID        NOT NULL UNIQUE REFERENCES bills(id) ON DELETE CASCADE,
  plain_summary        TEXT        NOT NULL,
  scenarios            JSONB       NOT NULL DEFAULT '[]',
  likely_beneficiaries JSONB       NOT NULL DEFAULT '[]',
  likely_costs         JSONB       NOT NULL DEFAULT '[]',
  official_estimates   JSONB       NOT NULL DEFAULT '[]',
  coded_by             TEXT        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Official CBO cost-estimate links from Congress.gov bill detail, the
-- official anchor for a brief. Bills with roll-call votes are marked for one
-- re-fetch so the column is populated where it matters first.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cbo_estimates JSONB NOT NULL DEFAULT '[]';
UPDATE bills SET source_updated_at = NULL
  WHERE id IN (SELECT DISTINCT bill_id FROM votes WHERE bill_id IS NOT NULL);
