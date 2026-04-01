export const POLICY_TAGS = [
  'healthcare',
  'education',
  'environment',
  'economy',
  'defense',
  'immigration',
  'housing',
  'infrastructure',
  'civil-rights',
  'foreign-policy',
] as const;

export type PolicyTag = (typeof POLICY_TAGS)[number];

export const BILL_STATUSES = [
  'introduced',
  'committee',
  'floor',
  'passed-house',
  'passed-senate',
  'enrolled',
  'signed',
  'vetoed',
] as const;

export type BillStatus = (typeof BILL_STATUSES)[number];

export const VOTE_VALUES = ['yea', 'nay', 'abstain', 'not-voting'] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];
