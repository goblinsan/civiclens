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
} from './questionnaire.js';
