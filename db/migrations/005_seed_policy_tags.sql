-- Migration: 005_seed_policy_tags
-- Description: Insert the canonical policy tags as part of the schema.
--
--              The ten tags are reference data that the application depends on
--              (POLICY_TAGS in packages/shared/src/constants.ts): the
--              questionnaire lists them and the ingest job joins against them
--              when writing derived bill_tags. Until now only the dev seed
--              inserted them, so a fresh production database had an empty
--              questionnaire and the ingest job silently wrote no tags.
--
--              The UUIDs match db/seeds/seed.ts so the seed's fixed-id
--              references (bill_tags, questionnaire_answers) keep working on a
--              database that was migrated first.

INSERT INTO policy_tags (id, slug, label) VALUES
  ('01000000-0000-0000-0000-000000000001', 'healthcare',     'Healthcare'),
  ('01000000-0000-0000-0000-000000000002', 'education',      'Education'),
  ('01000000-0000-0000-0000-000000000003', 'environment',    'Environment'),
  ('01000000-0000-0000-0000-000000000004', 'economy',        'Economy'),
  ('01000000-0000-0000-0000-000000000005', 'defense',        'Defense'),
  ('01000000-0000-0000-0000-000000000006', 'immigration',    'Immigration'),
  ('01000000-0000-0000-0000-000000000007', 'housing',        'Housing'),
  ('01000000-0000-0000-0000-000000000008', 'infrastructure', 'Infrastructure'),
  ('01000000-0000-0000-0000-000000000009', 'civil-rights',   'Civil Rights'),
  ('01000000-0000-0000-0000-000000000010', 'foreign-policy', 'Foreign Policy')
ON CONFLICT (slug) DO NOTHING;
