import { z } from 'zod';

/**
 * Policy goals: the questionnaire's unit of agreement. A goal is a concrete
 * direction of federal action that a bill can advance or hinder. The
 * canonical list lives in data/policy-goals.json (docs/policy-goals.md is the
 * narrative copy; a test keeps the two in step) and is synced into the
 * policy_goals table by `pnpm db:sync-goals`.
 */

export const GOAL_STANCES = ['support', 'oppose'] as const;
export type GoalStance = (typeof GOAL_STANCES)[number];

/** How much an answered goal matters to the respondent: a little / some / a lot. */
export const GOAL_IMPORTANCE_LEVELS = [1, 2, 3] as const;
export type GoalImportance = (typeof GOAL_IMPORTANCE_LEVELS)[number];

export const GOAL_EFFECTS = ['advances', 'hinders'] as const;
export type GoalEffect = (typeof GOAL_EFFECTS)[number];

/** 1 = partial or incidental, 2 = clear, 3 = the bill's central purpose. */
export const EFFECT_STRENGTHS = [1, 2, 3] as const;
export type EffectStrength = (typeof EFFECT_STRENGTHS)[number];

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-case kebab-case');

export const PolicyGoalSchema = z.object({
  slug,
  statement: z.string().min(10),
  /** What a bill that advances the goal typically does; what hindering looks like. */
  legislationNote: z.string().min(10),
  /** Official CRS subject / policy-area terms that make a bill a candidate for coding. */
  candidateTerms: z.array(z.string().min(2)).min(1),
});
export type PolicyGoal = z.infer<typeof PolicyGoalSchema>;

export const PolicyGoalAreaSchema = z.object({
  slug,
  label: z.string().min(3),
  goals: z.array(PolicyGoalSchema).min(1),
});
export type PolicyGoalArea = z.infer<typeof PolicyGoalAreaSchema>;

export const PolicyGoalsFileSchema = z
  .object({
    version: z.literal(1),
    areas: z.array(PolicyGoalAreaSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const area of file.areas) {
      if (seen.has(area.slug)) ctx.addIssue({ code: 'custom', message: `duplicate slug ${area.slug}` });
      seen.add(area.slug);
      for (const goal of area.goals) {
        if (seen.has(goal.slug)) ctx.addIssue({ code: 'custom', message: `duplicate slug ${goal.slug}` });
        seen.add(goal.slug);
      }
    }
  });
export type PolicyGoalsFile = z.infer<typeof PolicyGoalsFileSchema>;

/** "HR-1", "S-3229", "HJRES-25"… matches the bill key used by the ingest job. */
export const BILL_KEY_PATTERN = /^(HR|S|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES)-\d+$/;

export const BillGoalEffectSchema = z.object({
  bill: z.string().regex(BILL_KEY_PATTERN, 'bill must look like HR-1 or S-25'),
  goal: slug,
  effect: z.enum(GOAL_EFFECTS),
  strength: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Why this bill advances or hinders the goal, in plain words. */
  rationale: z.string().min(20),
  /** The passage of the official CRS summary the rationale rests on. */
  evidence: z.string().min(10),
});
export type BillGoalEffect = z.infer<typeof BillGoalEffectSchema>;

export const BillGoalEffectsFileSchema = z
  .object({
    version: z.literal(1),
    congress: z.number().int().positive(),
    /** Who produced these codings; reviewed by whoever merged the file. */
    codedBy: z.string().min(1),
    effects: z.array(BillGoalEffectSchema),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const e of file.effects) {
      const key = `${e.bill}:${e.goal}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', message: `duplicate coding ${key}` });
      seen.add(key);
    }
  });
export type BillGoalEffectsFile = z.infer<typeof BillGoalEffectsFileSchema>;

/** Numeric direction of an effect, for scoring. */
export function effectDirection(effect: GoalEffect): 1 | -1 {
  return effect === 'advances' ? 1 : -1;
}

/** Numeric direction of a stance, for scoring. */
export function stanceDirection(stance: GoalStance): 1 | -1 {
  return stance === 'support' ? 1 : -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bill briefs: what a bill would likely do, in plain words
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A bill brief is editorial analysis, reviewed like a goal coding and shown
 * with that label. It rests on the official record (CRS summary, CBO cost
 * estimates) and says what assumptions each likely outcome needs and what
 * similar efforts produced before.
 */
export const BillPrecedentSchema = z.object({
  /** What was tried, e.g. "Production tax credit for wind, 1992 Energy Policy Act". */
  what: z.string().min(10),
  /** Year or range. */
  when: z.string().min(4),
  /** What it produced, as far as the record shows. */
  result: z.string().min(10),
  /** Where that is documented (an official or widely cited source). */
  source: z.string().url().optional(),
});

export const BillScenarioSchema = z.object({
  /** A likely result if the bill took effect, in one or two plain sentences. */
  outcome: z.string().min(20),
  /** What has to hold for that result to occur. */
  assumptions: z.array(z.string().min(10)).min(1),
  /** How likely the outcome is, given the assumptions. */
  likelihood: z.enum(['likely', 'plausible', 'uncertain']),
  precedents: z.array(BillPrecedentSchema).default([]),
});

export const BillStakeholderSchema = z.object({
  /** Who: a group named concretely ("households below 200% of poverty", "utility-scale solar developers"). */
  who: z.string().min(5),
  /** How they gain or bear cost. */
  how: z.string().min(10),
});

export const BillBriefSchema = z.object({
  bill: z.string().regex(BILL_KEY_PATTERN, 'bill must look like HR-1 or S-25'),
  /** What the bill does, in plain words, before any judgement. */
  plainSummary: z.string().min(40),
  scenarios: z.array(BillScenarioSchema).min(1),
  /** Who is likely to benefit most, and how. */
  likelyBeneficiaries: z.array(BillStakeholderSchema).min(1),
  /** Who is likely to bear the costs, and how. */
  likelyCosts: z.array(BillStakeholderSchema).default([]),
  /** Official estimates the brief rests on (CBO, JCT, GAO); URL plus the finding in one sentence. */
  officialEstimates: z
    .array(z.object({ source: z.string().min(2), url: z.string().url(), finding: z.string().min(10) }))
    .default([]),
});
export type BillBrief = z.infer<typeof BillBriefSchema>;

export const BillBriefsFileSchema = z
  .object({
    version: z.literal(1),
    congress: z.number().int().positive(),
    codedBy: z.string().min(1),
    briefs: z.array(BillBriefSchema),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const b of file.briefs) {
      if (seen.has(b.bill)) ctx.addIssue({ code: 'custom', message: `duplicate brief ${b.bill}` });
      seen.add(b.bill);
    }
  });
export type BillBriefsFile = z.infer<typeof BillBriefsFileSchema>;
