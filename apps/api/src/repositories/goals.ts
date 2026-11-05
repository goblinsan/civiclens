import type { BillBriefRow, BillGoalEffectRow, DbPool, PolicyGoalRow } from '@civreveal/db';

export interface GoalArea {
  slug: string;
  label: string;
  goals: Array<Pick<PolicyGoalRow, 'slug' | 'statement' | 'legislation_note'>>;
}

/** A coding as shown on a bill page: the goal it affects and why. */
export interface BillGoalEffectDetail extends Pick<BillGoalEffectRow, 'effect' | 'strength' | 'rationale' | 'evidence' | 'coded_by'> {
  goal_slug: string;
  goal_statement: string;
  area_label: string;
}

export function createGoalsRepository(pool: DbPool) {
  /** Active goals grouped by area, in the order of data/policy-goals.json. */
  async function listGoalAreas(): Promise<GoalArea[]> {
    const { rows } = await pool.query<PolicyGoalRow>(
      `SELECT * FROM policy_goals WHERE is_active ORDER BY sort_order`,
    );
    const areas: GoalArea[] = [];
    for (const row of rows) {
      let area = areas[areas.length - 1];
      if (!area || area.slug !== row.area_slug) {
        area = { slug: row.area_slug, label: row.area_label, goals: [] };
        areas.push(area);
      }
      area.goals.push({ slug: row.slug, statement: row.statement, legislation_note: row.legislation_note });
    }
    return areas;
  }

  async function listBillGoalEffects(billId: string): Promise<BillGoalEffectDetail[]> {
    const { rows } = await pool.query<BillGoalEffectDetail>(
      `SELECT e.effect, e.strength, e.rationale, e.evidence, e.coded_by,
              g.slug AS goal_slug, g.statement AS goal_statement, g.area_label
       FROM bill_goal_effects e
       JOIN policy_goals g ON g.id = e.goal_id
       WHERE e.bill_id = $1
       ORDER BY g.sort_order`,
      [billId],
    );
    return rows;
  }

  async function getBillBrief(billId: string): Promise<BillBriefRow | null> {
    const { rows } = await pool.query<BillBriefRow>(`SELECT * FROM bill_briefs WHERE bill_id = $1`, [billId]);
    return rows[0] ?? null;
  }

  /** How many bills carry at least one coding, and how many briefs exist. */
  async function coverage(): Promise<{ coded_bills: number; briefs: number }> {
    const { rows } = await pool.query<{ coded_bills: string; briefs: string }>(
      `SELECT (SELECT COUNT(DISTINCT bill_id) FROM bill_goal_effects) AS coded_bills,
              (SELECT COUNT(*) FROM bill_briefs) AS briefs`,
    );
    return { coded_bills: Number(rows[0]?.coded_bills ?? 0), briefs: Number(rows[0]?.briefs ?? 0) };
  }

  return { listGoalAreas, listBillGoalEffects, getBillBrief, coverage };
}

export type GoalsRepository = ReturnType<typeof createGoalsRepository>;
