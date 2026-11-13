export { createBillsRepository } from './bills.js';
export type { BillsRepository, BillWithTags, ListBillsOptions, PaginatedResult } from './bills.js';

export { createPoliticiansRepository } from './politicians.js';
export type {
  PoliticiansRepository,
  ListPoliticiansOptions,
} from './politicians.js';

export { createVotesRepository } from './votes.js';
export type {
  VotesRepository,
  VoteWithRecords,
  VoteRecordWithPolitician,
} from './votes.js';

export { createQuestionnaireRepository } from './questionnaire.js';
export type {
  QuestionnaireRepository,
  MatchResultWithPolitician,
  MatchEvidenceRow,
  GoalAnswerInput,
} from './questionnaire.js';

export { createGoalsRepository } from './goals.js';
export type { GoalsRepository, GoalArea, BillGoalEffectDetail } from './goals.js';

export { createAuditLogRepository } from './auditLog.js';
export type {
  AuditLogRepository,
  IngestionEvent,
  IngestionEventType,
  LogEventInput,
  QueryEventsOptions,
} from './auditLog.js';

export { createStatsRepository } from './stats.js';
export type { StatsRepository, SiteStats } from './stats.js';
