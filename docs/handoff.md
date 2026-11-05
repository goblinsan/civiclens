# Project state and handoff

Written 2026-11-05 so that every open thread can be picked up from a local
checkout with no dependence on any particular Claude session. Everything
below is either in this repository or reachable from the GitHub Actions tab.

## Where things stand

| Area | State |
| --- | --- |
| Hosting | Web on Cloudflare Pages (`apps/web`, root directory blank, output `apps/web/dist`); API in Docker on the home server behind the Cloudflare Tunnel, bound to the LAN address from `CIVREVEAL_BIND_ADDR` in `~/actions-runner/.env`; Neon Postgres. See [home-server-setup.md](./home-server-setup.md). |
| Deploys | Push to `main` → CI → `API image` builds, publishes to GHCR and redeploys on the home runner; Pages builds the web on the same push. |
| Members | 539 sitting members plus former members fetched on demand (`is_current = false`). |
| Bills | All 19,832 bills of the 119th Congress with CRS summary, policy area, subjects and policy tags. Scheduled ingest (every 6 h) keeps the last 7 days fresh in ~2 min. |
| House votes | 676 roll-calls with every member's position. **Questions are wrong until PR "store the House vote question" merges and the next ingest runs** (see below). |
| Senate votes | None. senate.gov refuses the bot from every network tried; see [data-ingestion.md](./data-ingestion.md). Each error line carries a senate.gov reference ID. |
| Scoring | Goal-based model live (`docs/scoring-methodology.md`): 79 goals in 12 areas synced to `policy_goals`. **No bill is coded yet**, so every member scores 50 until `data/bill-goal-effects/119.json` has entries and is merged. |
| Briefs | Schema, sync and UI exist; `data/bill-briefs/119.json` is empty. |

## Open work, in order

1. **Merge the vote-question fix** (branch `claude/quirky-ritchie-d6inud`,
   migration 010). Then run **Actions → Ingest Congress data → Run workflow**
   with `steps = house`, `max_votes = 0`. It re-fetches the House roll-calls
   whose stored question is not a real question (a few minutes). Check the
   run summary: `houseVotes.updated` ≈ 676, no failures.
2. **Draft the bill → goal codings.** `data/bill-goal-effects/README.md` has
   the rules; `packages/shared/src/schemas/policyGoal.ts` is the schema;
   `docs/policy-goals.md` lists the goals with what an advancing bill
   typically does. Candidates: **Actions → Coding candidates → Run workflow**
   (artifact `coding-candidates-119`, ~430 bills with roll-call votes, each
   with summary, classification, each roll-call's question, and candidate
   goals by official term). Only bills with a *decisive* question matter for
   scoring (`On Passage`, `On Motion to Suspend the Rules and Pass…`, `On
   Agreeing to the Resolution`, concurring, veto override). Open a PR; the
   merge is the review. `pnpm test` validates the file (unknown goals,
   duplicates, missing evidence).
3. **Draft bill briefs** for the same bills, same workflow, same file rules
   (`data/bill-briefs/README.md`). Cite CBO estimates where
   `bills.cbo_estimates` has them.
4. **Senate access.** Waiting on senate.gov / Akamai. If a reply arrives,
   nothing in the code needs to change; re-run the ingest and the Senate
   step either works or logs a reference ID.
5. Later: amendment and procedural votes coded in their own right; the
   areas with no goals yet (agriculture, technology, congressional process).

## Runbooks

### Ingest on demand
Actions → **Ingest Congress data** → Run workflow. Inputs: `max_bills` (0 =
no cap), `max_votes` (0 = no cap), `sync_since`, `congress`, `steps` (comma
list of `members,bills,senate,house`). Runs on the home runner; migrations
and `pnpm db:sync-goals` run first. Concurrency group `ingest-congress`
serialises runs. The summary on the run page has the numbers.

### Load reviewed codings or briefs
Merge the data file. The next ingest run (scheduled or manual) syncs it;
to sync immediately, run the ingest with `steps = members` (fast). The sync
deletes database rows for that congress that are no longer in the file.

### Redeploy the API
Push to `main`, or Actions → **API image** → Run workflow. The deploy job
prints `API bound to <addr>:3001`; if it says `127.0.0.1` while the tunnel
targets the LAN address, the runner's `~/actions-runner/.env` lost
`CIVREVEAL_BIND_ADDR` or the runner service was not restarted after editing
it.

### Verify locally on a fresh Postgres
```bash
export DATABASE_URL=postgres://postgres@localhost:5432/civreveal
pnpm db:migrate && pnpm db:sync-goals
pnpm --filter @civreveal/api dev   # then GET /questionnaire/goals, POST /questionnaire/submit, GET /questionnaire/matches
```
`apps/api/src/routes/routes.integration.test.ts` shows the request shapes;
the smoke-test section of [launch-runbook.md](./launch-runbook.md) has curl
lines.

## Lessons that cost time

- **Time zones.** The home runner is not on UTC. `ingest.yml` pins `TZ=UTC`
  and `parseDateOrNull` reads zone-less timestamps as UTC; keep both.
- **Skip checks compare like with like.** The bill skip check compares the
  *list* `updateDate` with what was stored; store the list value, never the
  detail's. The House vote check already works this way.
- **Read response bodies inside the retry.** A `Response` held unread while
  a sibling request times out becomes unusable. `fetchJson` consumes bodies
  inside the timeout window.
- **Deploy bind address** lives only in the runner's `.env`, by design.
- **senate.gov** blocks from cloud and home networks alike with its own
  "Unauthorized" page; the error excerpt carries its reference ID.
- **Congress.gov list endpoints** omit fields the per-item endpoints have
  (vote question, CBO estimates). Check the per-item payload before relying
  on a list field.

## Conventions

- Branch, commit, push; open a PR; CI (lint, typecheck, test, build) must be
  green. PR bodies describe why, what, and how it was verified.
- Official sources only; never work around a site's bot protection.
- Editorial content (goals, codings, briefs) is data in the repo, reviewed
  by the PR that merges it, labelled "Analysis" on the site.
