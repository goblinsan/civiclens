-- Migration: 001_initial_schema
-- Description: MVP normalized schema for CivReveal

-- Enable pgcrypto for gen_random_uuid() on PostgreSQL < 13
-- (PostgreSQL 13+ uses gen_random_uuid() built-in; keep the extension for compatibility)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- Jurisdictions  (federal government, states, districts)
-- ─────────────────────────────────────────────
CREATE TABLE jurisdictions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL CHECK (type IN ('federal', 'state', 'district')),
  name        TEXT        NOT NULL,
  code        TEXT        NOT NULL,           -- e.g. 'US', 'CA', 'TX-07'
  parent_id   UUID        REFERENCES jurisdictions(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type, code)
);

-- ─────────────────────────────────────────────
-- Offices  (Senate seats, House seats, etc.)
-- ─────────────────────────────────────────────
CREATE TABLE offices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id UUID        NOT NULL REFERENCES jurisdictions(id),
  chamber         TEXT        NOT NULL CHECK (chamber IN ('senate', 'house', 'presidency')),
  district        INT,                        -- NULL for senate / presidency
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Politicians
-- ─────────────────────────────────────────────
CREATE TABLE politicians (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bioguide_id   TEXT        NOT NULL UNIQUE,  -- Congress.gov identifier
  first_name    TEXT        NOT NULL,
  last_name     TEXT        NOT NULL,
  party         TEXT        NOT NULL,
  state         TEXT        NOT NULL,
  chamber       TEXT        NOT NULL CHECK (chamber IN ('senate', 'house')),
  district      INT,                          -- NULL for senators
  image_url     TEXT,
  website       TEXT,
  office_id     UUID        REFERENCES offices(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Bills
-- ─────────────────────────────────────────────
CREATE TABLE bills (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  congress      INT         NOT NULL,
  bill_type     TEXT        NOT NULL,         -- HR, S, HJRES, SJRES, …
  bill_number   TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  summary       TEXT,
  status        TEXT        NOT NULL DEFAULT 'introduced'
                            CHECK (status IN (
                              'introduced','committee','floor',
                              'passed-house','passed-senate',
                              'enrolled','signed','vetoed'
                            )),
  sponsor_id    UUID        NOT NULL REFERENCES politicians(id),
  introduced_at TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (congress, bill_type, bill_number)
);

-- ─────────────────────────────────────────────
-- Bill versions  (text snapshots at each stage)
-- ─────────────────────────────────────────────
CREATE TABLE bill_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     UUID        NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  version     TEXT        NOT NULL,           -- e.g. 'ih', 'rh', 'enr'
  text_url    TEXT,
  issued_at   TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Policy tags  (canonical set matching constants.ts)
-- ─────────────────────────────────────────────
CREATE TABLE policy_tags (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug  TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

-- ─────────────────────────────────────────────
-- Bill ↔ policy tag  (many-to-many)
-- ─────────────────────────────────────────────
CREATE TABLE bill_tags (
  bill_id       UUID NOT NULL REFERENCES bills(id)        ON DELETE CASCADE,
  policy_tag_id UUID NOT NULL REFERENCES policy_tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (bill_id, policy_tag_id)
);

-- ─────────────────────────────────────────────
-- Votes  (roll-call events)
-- ─────────────────────────────────────────────
CREATE TABLE votes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id          UUID        REFERENCES bills(id),   -- NULL for procedural votes
  chamber          TEXT        NOT NULL CHECK (chamber IN ('senate', 'house')),
  vote_date        TIMESTAMPTZ NOT NULL,
  result           TEXT        NOT NULL CHECK (result IN ('passed', 'failed', 'tie')),
  yea_count        INT         NOT NULL DEFAULT 0,
  nay_count        INT         NOT NULL DEFAULT 0,
  abstain_count    INT         NOT NULL DEFAULT 0,
  not_voting_count INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Vote records  (individual politician positions)
-- ─────────────────────────────────────────────
CREATE TABLE vote_records (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id       UUID        NOT NULL REFERENCES votes(id)      ON DELETE CASCADE,
  politician_id UUID        NOT NULL REFERENCES politicians(id),
  value         TEXT        NOT NULL CHECK (value IN ('yea', 'nay', 'abstain', 'not-voting')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vote_id, politician_id)
);

-- ─────────────────────────────────────────────
-- Questionnaire profiles  (one per anonymous session)
-- ─────────────────────────────────────────────
CREATE TABLE questionnaire_profiles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT        NOT NULL UNIQUE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Questionnaire answers
-- ─────────────────────────────────────────────
CREATE TABLE questionnaire_answers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID        NOT NULL REFERENCES questionnaire_profiles(id) ON DELETE CASCADE,
  policy_tag_id UUID        NOT NULL REFERENCES policy_tags(id),
  stance        TEXT        NOT NULL CHECK (stance IN (
                              'strongly-support', 'support', 'neutral',
                              'oppose', 'strongly-oppose'
                            )),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, policy_tag_id)
);

-- ─────────────────────────────────────────────
-- Match results  (politician alignment scores)
-- ─────────────────────────────────────────────
CREATE TABLE match_results (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID        NOT NULL REFERENCES questionnaire_profiles(id) ON DELETE CASCADE,
  politician_id UUID        NOT NULL REFERENCES politicians(id),
  score         NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  breakdown     JSONB       NOT NULL DEFAULT '{}',   -- per-tag score map
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, politician_id)
);

-- ─────────────────────────────────────────────
-- Sentiment submissions  (anonymous bill reactions)
-- ─────────────────────────────────────────────
CREATE TABLE sentiment_submissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id      UUID        NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  session_id   TEXT        NOT NULL,
  sentiment    TEXT        NOT NULL CHECK (sentiment IN ('support', 'oppose', 'neutral')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bill_id, session_id)
);

-- ─────────────────────────────────────────────
-- Raw payloads  (source data audit trail — issue #12)
-- Stores the original API response so every ingested record can be
-- traced back to its source.  Retention policy: keep indefinitely;
-- archive to cold storage after 2 years (documented in docs/data-retention.md).
-- ─────────────────────────────────────────────
CREATE TABLE raw_payloads (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system TEXT        NOT NULL,   -- e.g. 'congress.gov', 'govtrack'
  source_id     TEXT        NOT NULL,   -- identifier within source system
  payload       JSONB       NOT NULL,   -- verbatim API response
  checksum      TEXT,                   -- SHA-256 hex of payload text
  retrieved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_system, source_id, retrieved_at)
);

-- ─────────────────────────────────────────────
-- Audit logs  (append-only mutation history)
-- ─────────────────────────────────────────────
CREATE TABLE audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT        NOT NULL,
  record_id    UUID        NOT NULL,
  action       TEXT        NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_data     JSONB,
  new_data     JSONB,
  source       TEXT,                    -- 'api', 'ingest', 'seed', 'migration'
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Indexes  (support common query patterns)
-- ─────────────────────────────────────────────
CREATE INDEX idx_bills_status          ON bills (status);
CREATE INDEX idx_bills_congress        ON bills (congress);
CREATE INDEX idx_bills_sponsor         ON bills (sponsor_id);
CREATE INDEX idx_bill_versions_bill    ON bill_versions (bill_id);
CREATE INDEX idx_bill_tags_tag         ON bill_tags (policy_tag_id);
CREATE INDEX idx_votes_bill            ON votes (bill_id);
CREATE INDEX idx_vote_records_vote     ON vote_records (vote_id);
CREATE INDEX idx_vote_records_pol      ON vote_records (politician_id);
CREATE INDEX idx_match_results_profile ON match_results (profile_id);
CREATE INDEX idx_raw_payloads_source   ON raw_payloads (source_system, source_id);
CREATE INDEX idx_audit_logs_table      ON audit_logs (table_name, record_id);
CREATE INDEX idx_audit_logs_performed  ON audit_logs (performed_at DESC);
