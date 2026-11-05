import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BillBriefsFileSchema, BillGoalEffectsFileSchema, PolicyGoalsFileSchema } from './policyGoal.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const goalsFile = JSON.parse(readFileSync(join(repoRoot, 'data', 'policy-goals.json'), 'utf8'));

describe('data/policy-goals.json', () => {
  it('validates against the schema', () => {
    const parsed = PolicyGoalsFileSchema.safeParse(goalsFile);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  });

  it('matches the tables in docs/policy-goals.md', () => {
    const doc = readFileSync(join(repoRoot, 'docs', 'policy-goals.md'), 'utf8');
    const fromDoc = new Map<string, string>();
    for (const line of doc.split('\n')) {
      if (!line.startsWith('| `')) continue;
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      fromDoc.set(cells[0]!.replace(/`/g, ''), cells[1]!);
    }
    const fromJson = new Map<string, string>();
    for (const area of PolicyGoalsFileSchema.parse(goalsFile).areas) {
      for (const goal of area.goals) fromJson.set(goal.slug, goal.statement);
    }
    expect([...fromJson.keys()].sort()).toEqual([...fromDoc.keys()].sort());
    for (const [slug, statement] of fromJson) expect(fromDoc.get(slug), slug).toBe(statement);
  });
});

describe('data/bill-goal-effects/*.json', () => {
  const dir = join(repoRoot, 'data', 'bill-goal-effects');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const goalSlugs = new Set(
    PolicyGoalsFileSchema.parse(goalsFile).areas.flatMap((a) => a.goals.map((g) => g.slug)),
  );

  it.each(files)('%s validates and references known goals', (file) => {
    const parsed = BillGoalEffectsFileSchema.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    if (!parsed.success) return;
    for (const e of parsed.data.effects) expect(goalSlugs.has(e.goal), `${e.bill}: unknown goal ${e.goal}`).toBe(true);
  });
});

describe('data/bill-briefs/*.json', () => {
  const dir = join(repoRoot, 'data', 'bill-briefs');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it.each(files)('%s validates', (file) => {
    const parsed = BillBriefsFileSchema.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  });
});
