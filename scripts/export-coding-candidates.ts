/**
 * Export every bill of a congress that has a recorded roll-call vote, with the
 * material a coder needs: official title, CRS policy area and subjects, the
 * CRS summary, each roll-call (question, result, tally), and the goals whose
 * candidate terms match the bill's official classification.
 *
 *   DATABASE_URL=... CONGRESS=119 pnpm --filter @civreveal/scripts export-candidates > out.json
 *
 * Output is JSON on stdout; the "Coding candidates" workflow uploads it as an
 * artifact. Nothing here is a judgement: candidate goals are a search aid.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PolicyGoalsFileSchema } from '@civreveal/shared';

const { Pool } = pg;

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/civreveal';
const CONGRESS = Number(process.env['CONGRESS'] ?? '119');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goalsFile = PolicyGoalsFileSchema.parse(
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/policy-goals.json'), 'utf8')),
);

interface Row {
  bill_type: string;
  bill_number: string;
  title: string;
  status: string;
  policy_area: string | null;
  subjects: string[];
  summary: string | null;
  introduced_at: Date;
  votes: Array<{
    date: string;
    chamber: string;
    question: string | null;
    result: string;
    yea: number;
    nay: number;
  }>;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const { rows } = await pool.query<Row>(
    `SELECT b.bill_type, b.bill_number, b.title, b.status, b.policy_area, b.subjects, b.summary,
            b.introduced_at,
            json_agg(json_build_object(
              'date', v.vote_date, 'chamber', v.chamber, 'question', v.question,
              'result', v.result, 'yea', v.yea_count, 'nay', v.nay_count
            ) ORDER BY v.vote_date) AS votes
     FROM bills b
     JOIN votes v ON v.bill_id = b.id
     WHERE b.congress = $1
     GROUP BY b.id
     ORDER BY b.bill_type, b.bill_number::int`,
    [CONGRESS],
  );
  await pool.end();

  const termIndex = new Map<string, string[]>();
  for (const area of goalsFile.areas) {
    for (const goal of area.goals) {
      for (const term of goal.candidateTerms) {
        const key = term.toLowerCase();
        termIndex.set(key, [...(termIndex.get(key) ?? []), goal.slug]);
      }
    }
  }

  const bills = rows.map((r) => {
    const terms = [r.policy_area, ...r.subjects].filter((t): t is string => !!t).map((t) => t.toLowerCase());
    const candidateGoals = [...new Set(terms.flatMap((t) => termIndex.get(t) ?? []))];
    return {
      bill: `${r.bill_type.toUpperCase()}-${r.bill_number}`,
      title: r.title,
      status: r.status,
      introducedAt: r.introduced_at,
      policyArea: r.policy_area,
      subjects: r.subjects,
      summary: r.summary,
      votes: r.votes,
      candidateGoals,
    };
  });

  process.stdout.write(
    JSON.stringify({ congress: CONGRESS, exportedAt: new Date().toISOString(), count: bills.length, bills }, null, 1),
  );
  console.error(`[export-candidates] ${bills.length} bills with roll-call votes in congress ${CONGRESS}`);
}

main().catch((err: unknown) => {
  console.error('[export-candidates] ❌', err);
  process.exit(1);
});
