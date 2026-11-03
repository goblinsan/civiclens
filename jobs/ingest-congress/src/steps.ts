/**
 * steps.ts
 *
 * Which phases of the ingest job to run. Lets the Senate phase run on its own
 * (on a self-hosted runner outside cloud-provider IP ranges, which senate.gov
 * refuses) while members, bills and House votes run on hosted runners.
 */

export const INGEST_STEPS = ['members', 'bills', 'senate', 'house'] as const;
export type IngestStep = (typeof INGEST_STEPS)[number];

/** Steps that talk to api.congress.gov and therefore need CONGRESS_API_KEY. */
export const STEPS_NEEDING_API_KEY: readonly IngestStep[] = ['members', 'bills', 'house'];

/**
 * Parse a comma-separated INGEST_STEPS value. Empty or unset means every step.
 * Unknown names throw so a typo cannot silently skip a phase.
 */
export function parseIngestSteps(raw: string | undefined): Set<IngestStep> {
  if (!raw || raw.trim() === '') return new Set(INGEST_STEPS);

  const steps = new Set<IngestStep>();
  for (const part of raw.split(',')) {
    const name = part.trim().toLowerCase();
    if (name === '') continue;
    if (!(INGEST_STEPS as readonly string[]).includes(name)) {
      throw new Error(`Unknown ingest step "${name}" (valid: ${INGEST_STEPS.join(', ')})`);
    }
    steps.add(name as IngestStep);
  }
  if (steps.size === 0) throw new Error('INGEST_STEPS names no steps');
  return steps;
}

export function stepsNeedApiKey(steps: ReadonlySet<IngestStep>): boolean {
  return STEPS_NEEDING_API_KEY.some((s) => steps.has(s));
}
