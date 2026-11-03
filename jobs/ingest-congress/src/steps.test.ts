import { describe, it, expect } from 'vitest';
import { parseIngestSteps, stepsNeedApiKey, INGEST_STEPS } from './steps.js';

describe('parseIngestSteps', () => {
  it('defaults to every step when unset or blank', () => {
    expect([...parseIngestSteps(undefined)]).toEqual([...INGEST_STEPS]);
    expect([...parseIngestSteps('')]).toEqual([...INGEST_STEPS]);
    expect([...parseIngestSteps('   ')]).toEqual([...INGEST_STEPS]);
  });

  it('parses a comma-separated list, ignoring case, spaces and empty items', () => {
    expect([...parseIngestSteps(' Senate ,house,, ')]).toEqual(['senate', 'house']);
  });

  it('rejects unknown names rather than silently skipping', () => {
    expect(() => parseIngestSteps('senate,votes')).toThrow(/Unknown ingest step "votes"/);
    expect(() => parseIngestSteps(',')).toThrow(/names no steps/);
  });
});

describe('stepsNeedApiKey', () => {
  it('is false for a Senate-only run and true otherwise', () => {
    expect(stepsNeedApiKey(parseIngestSteps('senate'))).toBe(false);
    expect(stepsNeedApiKey(parseIngestSteps('senate,house'))).toBe(true);
    expect(stepsNeedApiKey(parseIngestSteps(undefined))).toBe(true);
  });
});
