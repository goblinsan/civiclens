# Data Ingestion — MVP Coverage & Source Boundaries

This document defines which data sources the CivReveal ingestion pipeline covers
at MVP, what the expected refresh cadence is, and where known gaps exist.

---

## Data sources

| Source | Data | Format | Auth required |
|--------|------|--------|---------------|
| [api.congress.gov](https://api.congress.gov) v3 | Bills, sponsors, summaries, official classification, members, **House roll-call votes** with member positions | JSON REST | API key (`CONGRESS_API_KEY`) |
| [Senate.gov LIS XML](https://www.senate.gov/legislative/votes_new.htm) | Senate roll-call vote lists & individual votes | XML | None — but see the Senate limitation below |

---

## Covered jurisdictions

- **Federal only.** State and local legislative data is out of scope for MVP.

---

## Covered congress sessions

The pipeline targets the **current congress** (configurable via the `CONGRESS`
environment variable; default `119`).  Historical backfill is possible by
re-running with earlier values and clearing `SYNC_SINCE`.

---

## Covered data types

### Members / politicians

- All currently-serving Senate and House members.
- Fields: `bioguide_id`, full name, party, state, chamber, district, official
  website, and bioguide portrait URL.
- **Not covered at MVP**: committees, social-media handles, committee assignments,
  party leadership roles, inactive/former members.

### Bills

- All bills updated since `SYNC_SINCE` (defaults to fetching recent updates).
- Bill types: HR, S, HJRES, SJRES, HCONRES, SCONRES, HRES, SRES.
- Fields: congress, type, number, title, status (normalised to 8-value canonical
  enum), sponsor bioguide ID, introduced date, latest plain-text summary, and
  the official CRS classification: policy area (`policy_area`) and legislative
  subject terms (`subjects`).
- Three requests per bill: detail, `/summaries`, `/subjects`. The latter two are
  best-effort; the bill is still stored if they fail.
- **Policy tags** (`bill_tags`) are derived from the official classification on
  every run using the public mapping in [bill-tagging.md](./bill-tagging.md).
  Tags with `source = 'manual'` are preserved; all others are recomputed.
- **Not covered at MVP**: full bill text, co-sponsors, committee referrals, CBO
  cost estimates, related bills, amendment tracking.

### Roll-call votes

- House votes come from the Congress.gov `house-vote` endpoint (list per
  session, then `/members` for every representative's position). Bill linkage
  comes from the API's `legislationType` / `legislationNumber`.
- Senate votes come from `senate.gov` XML feeds.
- Sessions are walked most-recent first: the current session is derived from
  the date (`SESSION` overrides it), and a full backfill (`MAX_VOTES=0`) covers
  every session of the congress.
- Up to `MAX_VOTES` most-recent vote details per chamber per run (default `50`).
- **Senate limitation (open):** senate.gov answers HTTP 403 to requests from
  cloud-provider IP ranges, including GitHub-hosted runners, regardless of
  User-Agent, and Congress.gov has no Senate vote endpoint yet. Scheduled runs
  therefore record a `fetch_failure` event for `senate_votes` and ingest no
  Senate roll-calls. Options under consideration: run the Senate step from a
  non-cloud network, or use a documented mirror of the senate.gov data.
- Per-member positions stored as `yea / nay / abstain / not-voting`.
- Votes are linked to a bill when the source XML identifies one; otherwise
  `bill_id` is `NULL`.
- **Not covered at MVP**: voice votes, procedural votes that are not recorded
  roll-calls, committee votes, nomination votes (Senate only; may appear as
  separate vote type with document type `PN` — stored but not linked to bill).

---

## Vote-value normalisation

| Source string | Canonical value |
|---------------|-----------------|
| Yea / Yes / Aye | `yea` |
| Nay / No | `nay` |
| Present | `abstain` |
| Not Voting / Absent / (empty) | `not-voting` |

---

## Bill-status normalisation

The latest action text from Congress.gov is mapped to a 8-state enum using
pattern matching (see `normalize.ts → normalizeBillStatus`):

| Pattern in action text | Status |
|------------------------|--------|
| "Signed by President" / "Became … Law" | `signed` |
| "Vetoed by President" | `vetoed` |
| "Presented to the President" / "Enrolled Bill" | `enrolled` |
| "Passed Senate" | `passed-senate` |
| "Passed House" | `passed-house` |
| "Floor consideration" / "Calendar" / "Called up" | `floor` |
| "Referred to" / "Committee" / "Reported" | `committee` |
| (default) | `introduced` |

---

## Refresh cadence

| Data type | Recommended cadence | Notes |
|-----------|---------------------|-------|
| Members | Daily | Member roster changes infrequently; also triggered on special elections |
| Bills | Every 6 hours | Bills can advance quickly during active floor periods |
| Senate votes | Every 6 hours during session | Senate may vote on multiple days per week |
| House votes | Every 6 hours during session | House may have 50–300 roll-calls per day during intensive periods |

In production the job runs on GitHub Actions
(`.github/workflows/ingest.yml`): every 6 hours as an incremental sync of bills
updated in the last 7 days, and on demand via **Actions → Ingest Congress data
→ Run workflow** with caps and a `SYNC_SINCE` cutoff as inputs. It applies
pending migrations first and writes a tagging-coverage summary to the run page.
It needs the `DATABASE_URL` and `CONGRESS_API_KEY` repository secrets.

---

## Idempotency and deduplication

Every ingest run is safe to repeat:

- **Politicians** are deduplicated on `bioguide_id` (`UNIQUE` constraint).
- **Bills** are deduplicated on `(congress, bill_type, bill_number)` (`UNIQUE` constraint).
- **Votes** are deduplicated on `source_id` (partial `UNIQUE` index, migration `002`).
- **Vote records** are deduplicated on `(vote_id, politician_id)` (`UNIQUE` constraint).
- Raw payloads are stored with SHA-256 checksums; unchanged payloads do not
  generate new rows or unnecessary updates.

---

## Incremental sync

Set `SYNC_SINCE` to an ISO-8601 datetime to fetch only bills updated after that
point:

```bash
SYNC_SINCE=2026-01-01T00:00:00Z node dist/index.js
```

For votes, set `MAX_VOTES` to limit how many recent votes are fetched per
chamber per run (default `50`).

---

## Known gaps and future expansion

| Gap | Priority | Notes |
|-----|----------|-------|
| Bill full text | Medium | Available via `api.congress.gov` text versions; large payloads |
| Co-sponsors | Medium | Available via `/bill/{congress}/{type}/{number}/cosponsors` |
| Committee assignments | Low | Available via `/member/{bioguideId}/committees` |
| Historical members (inactive) | Low | Set `currentMember=false` in fetch; needs schema changes |
| State-level legislation | Future | OpenStates API; separate pipeline |
| Presidential actions (EOs) | Future | Federal Register API |
| Nomination votes (Senate PN) | Low | Currently stored without bill link |

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONGRESS_API_KEY` | ✅ | — | API key from [api.congress.gov](https://api.congress.gov/sign-up/) |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `CONGRESS` | — | `119` | Congress number to ingest |
| `SESSION` | — | derived from the date | Restrict votes to one session (`1` or `2`); default walks every session up to the current one |
| `SYNC_SINCE` | — | (none) | ISO-8601 datetime; bills updated after this are fetched |
| `MAX_BILLS` | — | `0` (no limit) | Cap on bills fetched per run |
| `MAX_VOTES` | — | `50` | Max votes per chamber per run |
| `LOG_LEVEL` | — | `info` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
