import { describe, it, expect } from 'vitest';
import { POLICY_TAGS } from '@civreveal/shared';
import {
  deriveTags,
  isKnownPolicyArea,
  KNOWN_POLICY_AREAS,
  POLICY_AREA_TAGS,
  SUBJECT_TAGS,
} from './tagging.js';

describe('mapping tables', () => {
  it('every mapped policy area is in the controlled CRS list', () => {
    const known = new Set<string>(KNOWN_POLICY_AREAS);
    for (const area of Object.keys(POLICY_AREA_TAGS)) {
      expect(known.has(area), `"${area}" is not a known policy area`).toBe(true);
    }
  });

  it('every mapping target is a valid policy tag', () => {
    const valid = new Set<string>(POLICY_TAGS);
    for (const tags of [...Object.values(POLICY_AREA_TAGS), ...Object.values(SUBJECT_TAGS)]) {
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) expect(valid.has(tag), `"${tag}" is not a policy tag`).toBe(true);
    }
  });

  it('every policy tag is reachable from at least one official term', () => {
    const reachable = new Set<string>();
    for (const tags of [...Object.values(POLICY_AREA_TAGS), ...Object.values(SUBJECT_TAGS)]) {
      for (const tag of tags) reachable.add(tag);
    }
    for (const tag of POLICY_TAGS) {
      expect(reachable.has(tag), `"${tag}" can never be derived`).toBe(true);
    }
  });

  it('has no duplicate keys differing only by case or whitespace', () => {
    for (const table of [POLICY_AREA_TAGS, SUBJECT_TAGS]) {
      const keys = Object.keys(table).map((k) => k.trim().replace(/\s+/g, ' ').toLowerCase());
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('isKnownPolicyArea', () => {
  it('recognises controlled-list terms regardless of case and spacing', () => {
    expect(isKnownPolicyArea('Health')).toBe(true);
    expect(isKnownPolicyArea('  health ')).toBe(true);
    expect(isKnownPolicyArea('ARMED FORCES AND   NATIONAL SECURITY')).toBe(true);
  });

  it('rejects terms outside the list', () => {
    expect(isKnownPolicyArea('Healthcare')).toBe(false);
    expect(isKnownPolicyArea('')).toBe(false);
  });
});

describe('deriveTags', () => {
  it('maps a policy area to its tags', () => {
    expect(deriveTags({ policyArea: 'Health', subjects: [] })).toEqual([
      { tag: 'healthcare', source: 'policy-area', matchedOn: 'Health' },
    ]);
  });

  it('maps a policy area to multiple tags when listed', () => {
    const tags = deriveTags({ policyArea: 'Foreign Trade and International Finance', subjects: [] });
    expect(tags.map((t) => t.tag)).toEqual(['economy', 'foreign-policy']);
    expect(tags.every((t) => t.source === 'policy-area')).toBe(true);
  });

  it('maps subject terms to tags', () => {
    const tags = deriveTags({ policyArea: null, subjects: ['Medicaid', 'Roads and highways'] });
    expect(tags).toEqual([
      { tag: 'healthcare', source: 'subject', matchedOn: 'Medicaid' },
      { tag: 'infrastructure', source: 'subject', matchedOn: 'Roads and highways' },
    ]);
  });

  it('lets a subject tag a bill whose policy area is unmapped', () => {
    const tags = deriveTags({
      policyArea: 'Social Welfare',
      subjects: ['Congressional oversight', 'Medicare'],
    });
    expect(tags).toEqual([{ tag: 'healthcare', source: 'subject', matchedOn: 'Medicare' }]);
  });

  it('records the policy area as the source when both produce the same tag', () => {
    const tags = deriveTags({ policyArea: 'Health', subjects: ['Medicare'] });
    expect(tags).toEqual([{ tag: 'healthcare', source: 'policy-area', matchedOn: 'Health' }]);
  });

  it('never emits the same tag twice', () => {
    const tags = deriveTags({ policyArea: null, subjects: ['Medicare', 'Medicaid', 'Medicare'] });
    expect(tags).toHaveLength(1);
  });

  it('returns a deterministic order independent of input order', () => {
    const a = deriveTags({ policyArea: null, subjects: ['Voting rights', 'Medicaid', 'Sanctions'] });
    const b = deriveTags({ policyArea: null, subjects: ['Sanctions', 'Voting rights', 'Medicaid'] });
    expect(a).toEqual(b);
    expect(a.map((t) => t.tag)).toEqual(['healthcare', 'civil-rights', 'foreign-policy']);
  });

  it('is case- and whitespace-insensitive but preserves the official term', () => {
    const tags = deriveTags({ policyArea: '  environmental   protection ', subjects: ['  air QUALITY '] });
    expect(tags).toEqual([
      { tag: 'environment', source: 'policy-area', matchedOn: 'environmental   protection' },
    ]);
  });

  it('returns no tags for unmapped or unknown terms', () => {
    expect(deriveTags({ policyArea: 'Sports and Recreation', subjects: ['Congressional oversight'] })).toEqual([]);
    expect(deriveTags({ policyArea: 'Not A Real Area', subjects: ['Not A Real Subject'] })).toEqual([]);
  });

  it('tolerates missing input', () => {
    expect(deriveTags({ policyArea: null, subjects: null })).toEqual([]);
    expect(deriveTags({ policyArea: undefined, subjects: undefined })).toEqual([]);
    expect(deriveTags({ policyArea: '', subjects: ['', '   '] })).toEqual([]);
  });

  it('tags veterans medical care as both healthcare and defense', () => {
    const tags = deriveTags({ policyArea: null, subjects: ["Veterans' medical care"] });
    expect(tags.map((t) => t.tag)).toEqual(['healthcare', 'defense']);
  });
});
