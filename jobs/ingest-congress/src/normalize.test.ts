import { describe, it, expect } from 'vitest';
import {
  normalizeBillStatus,
  normalizeVoteValue,
  normalizeVoteResult,
  normalizeMember,
  normalizeBill,
  normalizeVoteEvent,
} from './normalize.js';
import type { CongressMemberSummary, CongressBillSummary, CongressVoteEvent } from './normalize.js';

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
