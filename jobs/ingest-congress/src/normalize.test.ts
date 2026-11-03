import { describe, it, expect } from 'vitest';
import {
  normalizeBillStatus,
  normalizeVoteValue,
  normalizeVoteResult,
  normalizeMember,
  normalizeBill,
  normalizeVoteEvent,
  normalizeHouseVoteApi,
  currentSessionFor,
  firstYearOfCongress,
} from './normalize.js';
import type {
  CongressMemberSummary,
  CongressBillSummary,
  CongressVoteEvent,
  HouseVoteApiItem,
  HouseVoteApiMemberVote,
} from './normalize.js';

// ─────────────────────────────────────────────────────────────────────────────
// normalizeBillStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeBillStatus', () => {
  it('returns "signed" for president-signed actions', () => {
    expect(normalizeBillStatus('Signed by President')).toBe('signed');
    expect(normalizeBillStatus('Became Public Law No: 118-1.')).toBe('signed');
  });

  it('returns "vetoed" for vetoed actions', () => {
    expect(normalizeBillStatus('Vetoed by President.')).toBe('vetoed');
  });

  it('returns "enrolled" for enrolled-bill actions', () => {
    expect(normalizeBillStatus('Presented to the President.')).toBe('enrolled');
    expect(normalizeBillStatus('Enrolled Bill Signed.')).toBe('enrolled');
  });

  it('returns "passed-senate" for senate-passage actions', () => {
    expect(normalizeBillStatus('Passed Senate without amendment.')).toBe('passed-senate');
    expect(normalizeBillStatus('Passed the Senate by Unanimous Consent.')).toBe('passed-senate');
  });

  it('returns "passed-house" for house-passage actions', () => {
    expect(normalizeBillStatus('On passage Passed House.')).toBe('passed-house');
    expect(normalizeBillStatus('Passed the House by a vote of 300-120.')).toBe('passed-house');
  });

  it('returns "floor" for floor-consideration actions', () => {
    expect(normalizeBillStatus('Placed on the Senate Legislative Calendar')).toBe('floor');
    expect(normalizeBillStatus('Called up by Senate')).toBe('floor');
  });

  it('returns "committee" for committee-stage actions', () => {
    expect(normalizeBillStatus('Referred to the House Committee on Energy.')).toBe('committee');
    expect(normalizeBillStatus('Ordered to be Reported by the Full Committee.')).toBe('committee');
  });

  it('returns "introduced" as the default fallback', () => {
    expect(normalizeBillStatus('Introduced in House')).toBe('introduced');
    expect(normalizeBillStatus('')).toBe('introduced');
    expect(normalizeBillStatus('Some unknown action text')).toBe('introduced');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeVoteValue
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeVoteValue', () => {
  it.each([
    ['Yea', 'yea'],
    ['Yes', 'yea'],
    ['Aye', 'yea'],
    ['yea', 'yea'],
    ['Nay', 'nay'],
    ['No', 'nay'],
    ['nay', 'nay'],
    ['Present', 'abstain'],
    ['present', 'abstain'],
    ['Not Voting', 'not-voting'],
    ['Not voting', 'not-voting'],
    ['', 'not-voting'],
    ['Absent', 'not-voting'],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(normalizeVoteValue(input)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeVoteResult
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeVoteResult', () => {
  it.each([
    ['Passed', 'passed'],
    ['Agreed to', 'passed'],
    ['Confirmed', 'passed'],
    ['Adopted', 'passed'],
    ['Failed', 'failed'],
    ['Rejected', 'failed'],
    ['Not Agreed to', 'failed'],
    ['Defeated', 'failed'],
    ['Tie', 'tie'],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(normalizeVoteResult(input)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeMember
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeMember', () => {
  const senatorRaw: CongressMemberSummary = {
    bioguideId: 'S000148',
    firstName: 'Charles',
    lastName: 'Schumer',
    partyName: 'Democrat',
    state: 'New York',
    depiction: { imageUrl: 'https://bioguide.congress.gov/img/S000148.jpg' },
    officialWebsiteUrl: 'https://schumer.senate.gov',
    terms: {
      item: [{ chamber: 'Senate', congress: 118, startYear: 1999 }],
    },
  };

  it('maps a senator correctly', () => {
    const result = normalizeMember(senatorRaw);
    expect(result.bioguideId).toBe('S000148');
    expect(result.firstName).toBe('Charles');
    expect(result.lastName).toBe('Schumer');
    expect(result.party).toBe('Democrat');
    expect(result.state).toBe('New York');
    expect(result.chamber).toBe('senate');
    expect(result.district).toBeNull();
    expect(result.imageUrl).toBe('https://bioguide.congress.gov/img/S000148.jpg');
    expect(result.website).toBe('https://schumer.senate.gov');
  });

  const repRaw: CongressMemberSummary = {
    bioguideId: 'A000370',
    directOrderName: 'Adams, Alma S.',
    partyName: 'Democrat',
    state: 'North Carolina',
    district: 12,
    terms: {
      item: [{ chamber: 'House of Representatives', congress: 118, startYear: 2014 }],
    },
  };

  it('maps a house representative correctly, parsing name from directOrderName', () => {
    const result = normalizeMember(repRaw);
    expect(result.bioguideId).toBe('A000370');
    expect(result.lastName).toBe('Adams');
    expect(result.firstName).toBe('Alma S.');
    expect(result.chamber).toBe('house');
    expect(result.district).toBe(12);
    expect(result.imageUrl).toBeNull();
    expect(result.website).toBeNull();
  });

  it('maps party abbreviation "R" to "Republican"', () => {
    const raw: CongressMemberSummary = {
      bioguideId: 'X000001',
      firstName: 'John',
      lastName: 'Doe',
      partyName: 'R',
      state: 'TX',
      terms: { item: [{ chamber: 'Senate' }] },
    };
    expect(normalizeMember(raw).party).toBe('Republican');
  });

  it('defaults to house when terms list is empty', () => {
    const raw: CongressMemberSummary = {
      bioguideId: 'X000002',
      firstName: 'Jane',
      lastName: 'Roe',
      partyName: 'Democrat',
      state: 'CA',
      terms: { item: [] },
    };
    expect(normalizeMember(raw).chamber).toBe('house');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeBill
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeBill', () => {
  const rawBill: CongressBillSummary = {
    congress: 118,
    number: '1234',
    type: 'HR',
    title: 'Affordable Care Expansion Act',
    introducedDate: '2023-02-15',
    latestAction: { text: 'Referred to the House Committee on Energy and Commerce.' },
    sponsors: [{ bioguideId: 'A000370', firstName: 'Alma', lastName: 'Adams' }],
    summaryText: 'Expands Medicaid eligibility thresholds.',
  };

  it('maps fields correctly', () => {
    const result = normalizeBill(rawBill);
    expect(result.congress).toBe(118);
    expect(result.billNumber).toBe('1234');
    expect(result.billType).toBe('HR');
    expect(result.title).toBe('Affordable Care Expansion Act');
    expect(result.status).toBe('committee');
    expect(result.sponsorBioguideId).toBe('A000370');
    expect(result.summary).toBe('Expands Medicaid eligibility thresholds.');
    expect(result.introducedAt).toEqual(new Date('2023-02-15'));
  });

  it('uppercases the bill type', () => {
    const raw = { ...rawBill, type: 's' };
    expect(normalizeBill(raw).billType).toBe('S');
  });

  it('returns null summary when summaryText is absent', () => {
    const { summaryText: _omit, ...rest } = rawBill;
    expect(normalizeBill(rest).summary).toBeNull();
  });

  it('falls back to latestAction date when introducedDate is absent', () => {
    const { introducedDate: _omit, ...rest } = rawBill;
    const raw: CongressBillSummary = {
      ...rest,
      latestAction: { actionDate: '2023-05-01', text: 'Referred to committee.' },
    };
    expect(normalizeBill(raw).introducedAt).toEqual(new Date('2023-05-01'));
  });

  it('defaults classification to null / empty when absent', () => {
    const result = normalizeBill(rawBill);
    expect(result.policyArea).toBeNull();
    expect(result.subjects).toEqual([]);
  });

  it('carries the official policy area and subject terms through', () => {
    const raw: CongressBillSummary = {
      ...rawBill,
      policyArea: { name: 'Health' },
      legislativeSubjects: ['Medicaid', 'Health care coverage and access'],
    };
    const result = normalizeBill(raw);
    expect(result.policyArea).toBe('Health');
    expect(result.subjects).toEqual(['Medicaid', 'Health care coverage and access']);
  });

  it('trims, drops blanks and de-duplicates subject terms', () => {
    const raw: CongressBillSummary = {
      ...rawBill,
      policyArea: { name: '  Health  ' },
      legislativeSubjects: [' Medicaid ', '', 'Medicaid', '   '],
    };
    const result = normalizeBill(raw);
    expect(result.policyArea).toBe('Health');
    expect(result.subjects).toEqual(['Medicaid']);
  });

  it('treats a blank policy area name as unassigned', () => {
    const raw: CongressBillSummary = { ...rawBill, policyArea: { name: '   ' } };
    expect(normalizeBill(raw).policyArea).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeVoteEvent
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeVoteEvent', () => {
  const rawEvent: CongressVoteEvent = {
    sourceId: 'senate-118-1-1',
    chamber: 'senate',
    congress: 118,
    session: 1,
    rollCallNumber: 1,
    voteDate: '2023-01-03',
    result: 'Agreed to',
    yeaCount: 99,
    nayCount: 0,
    abstainCount: 0,
    notVotingCount: 1,
    billIdentifier: { type: 'HR', number: '1234', congress: 118 },
    members: [
      { bioguideId: 'S000148', votePosition: 'Yea' },
      { bioguideId: 'M000355', votePosition: 'Not Voting' },
    ],
  };

  it('normalizes a vote event correctly', () => {
    const { vote, records } = normalizeVoteEvent(rawEvent);
    expect(vote.sourceId).toBe('senate-118-1-1');
    expect(vote.chamber).toBe('senate');
    expect(vote.result).toBe('passed');
    expect(vote.yeaCount).toBe(99);
    expect(vote.billType).toBe('HR');
    expect(vote.billNumber).toBe('1234');
    expect(records).toHaveLength(2);
    expect(records[0]?.value).toBe('yea');
    expect(records[1]?.value).toBe('not-voting');
  });

  it('excludes members without a bioguideId from records', () => {
    const event: CongressVoteEvent = {
      ...rawEvent,
      members: [
        { votePosition: 'Yea' }, // no bioguideId
        { bioguideId: 'S000148', votePosition: 'Yea' },
      ],
    };
    const { records } = normalizeVoteEvent(event);
    expect(records).toHaveLength(1);
    expect(records[0]?.voterBioguideId).toBe('S000148');
  });

  it('handles missing billIdentifier', () => {
    const { billIdentifier: _omit, ...rest } = rawEvent;
    const { vote } = normalizeVoteEvent(rest);
    expect(vote.billCongress).toBeNull();
    expect(vote.billType).toBeNull();
    expect(vote.billNumber).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Congress session helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('firstYearOfCongress', () => {
  it('maps congress numbers to their first calendar year', () => {
    expect(firstYearOfCongress(119)).toBe(2025);
    expect(firstYearOfCongress(118)).toBe(2023);
    expect(firstYearOfCongress(117)).toBe(2021);
  });
});

describe('currentSessionFor', () => {
  it('returns session 1 in the first year and 2 in the second', () => {
    expect(currentSessionFor(119, new Date('2025-06-01T00:00:00Z'))).toBe(1);
    expect(currentSessionFor(119, new Date('2026-11-03T00:00:00Z'))).toBe(2);
  });

  it('clamps dates outside the congress', () => {
    expect(currentSessionFor(119, new Date('2024-12-31T00:00:00Z'))).toBe(1);
    expect(currentSessionFor(118, new Date('2026-01-01T00:00:00Z'))).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeHouseVoteApi
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeHouseVoteApi', () => {
  const item: HouseVoteApiItem = {
    congress: 119,
    identifier: 1192202674,
    legislationNumber: '1075',
    legislationType: 'HRES',
    legislationUrl: 'https://www.congress.gov/bill/119/house-resolution/1075',
    result: 'Passed',
    rollCallNumber: 74,
    sessionNumber: 2,
    sourceDataURL: 'https://clerk.house.gov/evs/2026/roll074.xml',
    startDate: '2026-02-24T14:18:00-05:00',
    updateDate: '2026-02-25T14:09:11-05:00',
    voteType: 'Recorded Vote',
  };
  const memberVotes: HouseVoteApiMemberVote[] = [
    { bioguideID: 'A000055', firstName: 'Robert', lastName: 'Aderholt', voteCast: 'Yea', voteParty: 'R', voteState: 'AL' },
    { bioguideID: 'A000148', firstName: 'Jake', lastName: 'Auchincloss', voteCast: 'Nay', voteParty: 'D', voteState: 'MA' },
    { bioguideID: 'A000369', firstName: 'Mark', lastName: 'Amodei', voteCast: 'Present', voteParty: 'R', voteState: 'NV' },
    { bioguideID: 'B000001', firstName: 'Pat', lastName: 'Absent', voteCast: 'Not Voting', voteParty: 'D', voteState: 'CA' },
    { bioguideID: 'C000001', firstName: 'Chris', lastName: 'Aye', voteCast: 'Aye', voteParty: 'R', voteState: 'TX' },
    { bioguideID: 'D000001', firstName: 'Dana', lastName: 'No', voteCast: 'No', voteParty: 'D', voteState: 'NY' },
  ];

  it('maps identity, date, result and session', () => {
    const event = normalizeHouseVoteApi(item, memberVotes);
    expect(event.sourceId).toBe('house-119-2-74');
    expect(event.chamber).toBe('house');
    expect(event.congress).toBe(119);
    expect(event.session).toBe(2);
    expect(event.rollCallNumber).toBe(74);
    expect(event.voteDate).toBe('2026-02-24T14:18:00-05:00');
    expect(event.result).toBe('Passed');
    expect(event.question).toBe('Recorded Vote');
  });

  it('tallies counts from member positions, including Aye/No synonyms', () => {
    const event = normalizeHouseVoteApi(item, memberVotes);
    expect(event.yeaCount).toBe(2);
    expect(event.nayCount).toBe(2);
    expect(event.abstainCount).toBe(1);
    expect(event.notVotingCount).toBe(1);
    expect(event.members).toHaveLength(6);
    expect(event.members[0]).toEqual({
      bioguideId: 'A000055',
      firstName: 'Robert',
      lastName: 'Aderholt',
      party: 'R',
      state: 'AL',
      votePosition: 'Yea',
    });
  });

  it('links the vote to its bill', () => {
    expect(normalizeHouseVoteApi(item, []).billIdentifier).toEqual({ type: 'HRES', number: '1075', congress: 119 });
    expect(normalizeHouseVoteApi({ ...item, legislationType: 'hr', legislationNumber: ' 42 ' }, []).billIdentifier)
      .toEqual({ type: 'HR', number: '42', congress: 119 });
  });

  it('leaves billIdentifier undefined for quorum calls and unknown types', () => {
    const { legislationNumber: _n, legislationType: _t, ...quorum } = item;
    expect(normalizeHouseVoteApi(quorum, []).billIdentifier).toBeUndefined();
    expect(normalizeHouseVoteApi({ ...item, legislationType: 'PN' }, []).billIdentifier).toBeUndefined();
    expect(normalizeHouseVoteApi({ ...item, legislationNumber: 'abc' }, []).billIdentifier).toBeUndefined();
  });

  it('prefers an explicit vote question over the vote type', () => {
    expect(normalizeHouseVoteApi({ ...item, voteQuestion: 'On Passage' }, []).question).toBe('On Passage');
  });

  it('treats a missing voteCast as not voting', () => {
    const event = normalizeHouseVoteApi(item, [{ bioguideID: 'X000001' }]);
    expect(event.notVotingCount).toBe(1);
    expect(event.members[0]?.votePosition).toBe('Not Voting');
  });
});
