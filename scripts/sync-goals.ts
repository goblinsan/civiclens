/**
 * Sync the repository's goal reference data into the database.
 *
 *   DATABASE_URL=postgres://... pnpm db:sync-goals
 *
 * - data/policy-goals.json      → policy_goals (upsert by slug; goals missing
 *                                 from the file are deactivated, never deleted,
 *                                 so stored answers keep their reference)
 * - data/bill-goal-effects/*.json → bill_goal_effects (upsert by bill+goal;
 *                                 rows for that congress not in the file are
 *                                 deleted — the file is the reviewed truth)
 * - data/bill-briefs/*.json      → bill_briefs (same rule, one per bill)
 *
 * Runs after migrations in the ingest workflow. Idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { BillBriefsFileSchema, BillGoalEffectsFileSchema, PolicyGoalsFileSchema } from '@civreveal/shared';

const { Pool } = pg;

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/civreveal';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    const goalsFile = PolicyGoalsFileSchema.parse(readJson(path.join(dataDir, 'policy-goals.json')));

    await client.query('BEGIN');

    const loadBillIds = async (congress: number): Promise<Map<string, string>> =>
      new Map(
        (
          await client.query<{ key: string; id: string }>(
            `SELECT upper(bill_type) || '-' || bill_number AS key, id FROM bills WHERE congress = $1`,
            [congress],
          )
        ).rows.map((r) => [r.key, r.id]),
      );

    // ── Goals ──────────────────────────────────────────────────────────────
    const activeSlugs: string[] = [];
    let sort = 0;
    for (const area of goalsFile.areas) {
      for (const goal of area.goals) {
        sort++;
        activeSlugs.push(goal.slug);
        await client.query(
          `INSERT INTO policy_goals
             (slug, area_slug, area_label, statement, legislation_note, candidate_terms, sort_order, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
           ON CONFLICT (slug) DO UPDATE SET
             area_slug        = EXCLUDED.area_slug,
             area_label       = EXCLUDED.area_label,
             statement        = EXCLUDED.statement,
             legislation_note = EXCLUDED.legislation_note,
             candidate_terms  = EXCLUDED.candidate_terms,
             sort_order       = EXCLUDED.sort_order,
             is_active        = TRUE,
             updated_at       = NOW()`,
          [goal.slug, area.slug, area.label, goal.statement, goal.legislationNote, goal.candidateTerms, sort],
        );
      }
    }
    const deactivated = await client.query(
      `UPDATE policy_goals SET is_active = FALSE, updated_at = NOW()
       WHERE is_active AND NOT (slug = ANY($1))`,
      [activeSlugs],
    );
    console.log(`[sync-goals] goals: ${activeSlugs.length} active, ${deactivated.rowCount ?? 0} deactivated`);

    const goalIds = new Map<string, string>(
      (await client.query<{ slug: string; id: string }>(`SELECT slug, id FROM policy_goals`)).rows.map(
        (r) => [r.slug, r.id],
      ),
    );

    // ── Effects ────────────────────────────────────────────────────────────
    const effectsDir = path.join(dataDir, 'bill-goal-effects');
    const files = fs.readdirSync(effectsDir).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      const parsed = BillGoalEffectsFileSchema.parse(readJson(path.join(effectsDir, file)));
      const billIds = await loadBillIds(parsed.congress);

      const kept: string[] = [];
      let missingBills = 0;
      for (const e of parsed.effects) {
        const billId = billIds.get(e.bill);
        const goalId = goalIds.get(e.goal);
        if (!goalId) throw new Error(`${file}: unknown goal ${e.goal}`);
        if (!billId) {
          missingBills++;
          console.warn(`[sync-goals] ${file}: bill ${e.bill} is not in the database yet; skipped`);
          continue;
        }
        const row = await client.query<{ id: string }>(
          `INSERT INTO bill_goal_effects (bill_id, goal_id, effect, strength, rationale, evidence, coded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (bill_id, goal_id) DO UPDATE SET
             effect     = EXCLUDED.effect,
             strength   = EXCLUDED.strength,
             rationale  = EXCLUDED.rationale,
             evidence   = EXCLUDED.evidence,
             coded_by   = EXCLUDED.coded_by,
             updated_at = NOW()
           RETURNING id`,
          [billId, goalId, e.effect, e.strength, e.rationale, e.evidence, parsed.codedBy],
        );
        kept.push(row.rows[0]!.id);
      }
      const removed = await client.query(
        `DELETE FROM bill_goal_effects
         WHERE bill_id IN (SELECT id FROM bills WHERE congress = $1)
           AND NOT (id = ANY($2::uuid[]))`,
        [parsed.congress, kept],
      );
      console.log(
        `[sync-goals] ${file}: ${kept.length} effects synced, ${removed.rowCount ?? 0} removed, ${missingBills} bills not yet ingested`,
      );
    }

    // ── Briefs ─────────────────────────────────────────────────────────────
    const briefsDir = path.join(dataDir, 'bill-briefs');
    const briefFiles = fs.readdirSync(briefsDir).filter((f) => f.endsWith('.json')).sort();
    for (const file of briefFiles) {
      const parsed = BillBriefsFileSchema.parse(readJson(path.join(briefsDir, file)));
      const billIds = await loadBillIds(parsed.congress);
      const kept: string[] = [];
      let missingBills = 0;
      for (const brief of parsed.briefs) {
        const billId = billIds.get(brief.bill);
        if (!billId) {
          missingBills++;
          console.warn(`[sync-goals] ${file}: bill ${brief.bill} is not in the database yet; skipped`);
          continue;
        }
        const row = await client.query<{ id: string }>(
          `INSERT INTO bill_briefs
             (bill_id, plain_summary, scenarios, likely_beneficiaries, likely_costs, official_estimates, coded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (bill_id) DO UPDATE SET
             plain_summary        = EXCLUDED.plain_summary,
             scenarios            = EXCLUDED.scenarios,
             likely_beneficiaries = EXCLUDED.likely_beneficiaries,
             likely_costs         = EXCLUDED.likely_costs,
             official_estimates   = EXCLUDED.official_estimates,
             coded_by             = EXCLUDED.coded_by,
             updated_at           = NOW()
           RETURNING id`,
          [
            billId,
            brief.plainSummary,
            JSON.stringify(brief.scenarios),
            JSON.stringify(brief.likelyBeneficiaries),
            JSON.stringify(brief.likelyCosts),
            JSON.stringify(brief.officialEstimates),
            parsed.codedBy,
          ],
        );
        kept.push(row.rows[0]!.id);
      }
      const removed = await client.query(
        `DELETE FROM bill_briefs
         WHERE bill_id IN (SELECT id FROM bills WHERE congress = $1)
           AND NOT (id = ANY($2::uuid[]))`,
        [parsed.congress, kept],
      );
      console.log(
        `[sync-goals] ${file}: ${kept.length} briefs synced, ${removed.rowCount ?? 0} removed, ${missingBills} bills not yet ingested`,
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[sync-goals] ❌', err);
  process.exit(1);
});
