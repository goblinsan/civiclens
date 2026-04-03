/**
 * Row types mirroring the database schema.
 * These are plain data-transfer objects; Zod validation lives in @civiclens/shared.
 */

export interface JurisdictionRow {
  id: string;
  type: 'federal' | 'state' | 'district';
  name: string;
  code: string;
  parent_id: string | null;
  created_at: Date;
}

export interface OfficeRow {
  id: string;
  jurisdiction_id: string;
  chamber: 'senate' | 'house' | 'presidency';
  district: number | null;
  created_at: Date;
}

export interface PoliticianRow {
  id: string;
  bioguide_id: string;
  first_name: string;
  last_name: string;
  party: string;
  state: string;
  chamber: 'senate' | 'house';
  district: number | null;
  image_url: string | null;
  website: string | null;
  office_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BillRow {
  id: string;
  congress: number;
  bill_type: string;
  bill_number: string;
  title: string;
  summary: string | null;
  status: string;
  sponsor_id: string;
  introduced_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface BillVersionRow {
  id: string;
  bill_id: string;
  version: string;
  text_url: string | null;
  issued_at: Date;
  created_at: Date;
}

export interface PolicyTagRow {
  id: string;
  slug: string;
  label: string;
}

export interface VoteRow {
  id: string;
  bill_id: string | null;
  chamber: 'senate' | 'house';
  vote_date: Date;
  result: 'passed' | 'failed' | 'tie';
  yea_count: number;
  nay_count: number;
  abstain_count: number;
  not_voting_count: number;
  source_id: string | null;
  created_at: Date;
}

export interface VoteRecordRow {
  id: string;
  vote_id: string;
  politician_id: string;
  value: 'yea' | 'nay' | 'abstain' | 'not-voting';
  created_at: Date;
}

export interface QuestionnaireProfileRow {
  id: string;
  session_id: string;
  submitted_at: Date;
  created_at: Date;
}

export interface QuestionnaireAnswerRow {
  id: string;
  profile_id: string;
  policy_tag_id: string;
  stance: 'strongly-support' | 'support' | 'neutral' | 'oppose' | 'strongly-oppose';
  created_at: Date;
}

export interface MatchResultRow {
  id: string;
  profile_id: string;
  politician_id: string;
  score: string; // NUMERIC comes back as string from pg
  breakdown: Record<string, number>;
  computed_at: Date;
}

export interface SentimentSubmissionRow {
  id: string;
  bill_id: string;
  session_id: string;
  sentiment: 'support' | 'oppose' | 'neutral';
  submitted_at: Date;
}

export interface RawPayloadRow {
  id: string;
  source_system: string;
  source_id: string;
  payload: unknown;
  checksum: string | null;
  retrieved_at: Date;
  created_at: Date;
}

export interface AuditLogRow {
  id: string;
  table_name: string;
  record_id: string;
  action: 'insert' | 'update' | 'delete';
  old_data: unknown;
  new_data: unknown;
  source: string | null;
  performed_at: Date;
}

export interface IngestionEventRow {
  id: string;
  event_type: string;
  source: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
  occurred_at: Date;
}
