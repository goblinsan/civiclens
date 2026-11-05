import { describe, expect, it } from 'vitest';
import { isDecisiveQuestion, scorePoliticians, toScore } from './goalScoring.js';
import type { AggregatedVoteRow } from './goalScoring.js';

describe('isDecisiveQuestion', () => {
  it.each([
    'On Passage',
    'On Motion to Suspend the Rules and Pass',
    'On Motion to Suspend the Rules and Pass, as Amended',
    'On Motion to Suspend the Rules and Agree',
    'On Motion to Suspend the Rules and Agree, as Amended',
    'On Agreeing to the Resolution',
    'On Agreeing to the Conference Report',
    'On Concurring in the Senate Amendment',
    'On Motion to Suspend the Rules and Concur in the Senate Amendment',
    'On Motion to Concur in the Senate Amendment',
    'On Passage, Objections of the President Notwithstanding',
    'On Overriding the Veto',
  ])('counts "%s"', (q) => {
    expect(isDecisiveQuestion(q)).toBe(true);
  });

  it.each([
    'On Motion to Recommit',
    'On Ordering the Previous Question',
    'On Agreeing to the Amendment',
    'On the Amendment',
    'On Motion to Table',
    'On Motion to Adjourn',
    'On Approving the Journal',
    'On Motion to Instruct Conferees',
    'On Agreeing to the Resolution Providing for Consideration of H.R. 1',
    'Call of the House',
    'On Motion to Commit',
    '',
  ])('excludes "%s"', (q) => {
    expect(isDecisiveQuestion(q)).toBe(false);
  });

  it('excludes a missing question', () => {
    expect(isDecisiveQuestion(null)).toBe(false);
    expect(isDecisiveQuestion(undefined)).toBe(false);
  });
});

describe('toScore', () => {
  it('maps the ratio onto 0–100 with 50 at even and when there is no data', () => {
    expect(toScore(0, 0)).toBe(50);
    expect(toScore(4, 4)).toBe(100);
    expect(toScore(-4, 4)).toBe(0);
    expect(toScore(0, 4)).toBe(50);
    expect(toScore(2, 4)).toBe(75);
  });
});

describe('scorePoliticians', () => {
  const base = { politicianId: 'p1', goalSlug: 'energy-nuclear-expand', importance: 2, strength: 2 } as const;

  it('a yea on a bill that advances a supported goal agrees', () => {
    const rows: AggregatedVoteRow[] = [{ ...base, stance: 'support', effect: 'advances', value: 'yea', count: 3 }];
    const s = scorePoliticians(rows).get('p1')!;
    expect(s.score).toBe(100);
    expect(s.totalVotes).toBe(3);
    expect(s.goals['energy-nuclear-expand']).toEqual({ score: 100, votes: 3, agreed: 3 });
  });

  it('a nay on a bill that hinders a supported goal also agrees; a yea on it disagrees', () => {
    const rows: AggregatedVoteRow[] = [
      { ...base, stance: 'support', effect: 'hinders', value: 'nay', count: 1 },
      { ...base, stance: 'support', effect: 'hinders', value: 'yea', count: 1 },
    ];
    expect(scorePoliticians(rows).get('p1')!.score).toBe(50);
  });

  it('opposing a goal flips the sign', () => {
    const rows: AggregatedVoteRow[] = [{ ...base, stance: 'oppose', effect: 'advances', value: 'yea', count: 2 }];
    expect(scorePoliticians(rows).get('p1')!.score).toBe(0);
  });

  it('weights by importance × strength', () => {
    const rows: AggregatedVoteRow[] = [
      { ...base, importance: 3, strength: 3, stance: 'support', effect: 'advances', value: 'yea', count: 1 }, // +9
      { ...base, importance: 1, strength: 1, stance: 'support', effect: 'advances', value: 'nay', count: 1 }, // -1
    ];
    // raw = 8, max = 10 → (0.8 + 1) / 2 = 90
    expect(scorePoliticians(rows).get('p1')!.score).toBe(90);
  });

  it('keeps goals separate in the breakdown and combines them in the total', () => {
    const rows: AggregatedVoteRow[] = [
      { ...base, stance: 'support', effect: 'advances', value: 'yea', count: 2 },
      { ...base, goalSlug: 'health-drug-price-negotiation', stance: 'support', effect: 'advances', value: 'nay', count: 2 },
    ];
    const s = scorePoliticians(rows).get('p1')!;
    expect(s.goals['energy-nuclear-expand']!.score).toBe(100);
    expect(s.goals['health-drug-price-negotiation']!.score).toBe(0);
    expect(s.score).toBe(50);
    expect(s.totalVotes).toBe(4);
  });

  it('ignores zero counts and separates politicians', () => {
    const rows: AggregatedVoteRow[] = [
      { ...base, stance: 'support', effect: 'advances', value: 'yea', count: 0 },
      { ...base, politicianId: 'p2', stance: 'support', effect: 'advances', value: 'nay', count: 1 },
    ];
    const result = scorePoliticians(rows);
    expect(result.has('p1')).toBe(false);
    expect(result.get('p2')!.score).toBe(0);
  });
});
