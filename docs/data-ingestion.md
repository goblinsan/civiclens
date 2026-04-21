# Data Ingestion — MVP Coverage & Source Boundaries

This document defines which data sources the CivReveal ingestion pipeline covers
at MVP, what the expected refresh cadence is, and where known gaps exist.

---

## Data sources

| Source | Data | Format | Auth required |
|--------|------|--------|---------------|
| [api.congress.gov](https://api.congress.gov) v3 | Bills, sponsors, summaries, members | JSON REST | API key (`CONGRESS_API_KEY`) |
| [Senate.gov LIS XML](https://www.senate.gov/legislative/votes_new.htm) | Senate roll-call vote lists & individual votes | XML | None |
| [House Clerk EVS](https://clerk.house.gov/evs/) | House roll-call vote lists & individual votes | XML | None |

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
  enum), sponsor bioguide ID, introduced date, and latest plain-text summary.
- **Not covered at MVP**: full bill text, co-sponsors, committee referrals, CBO
  cost estimates, related bills, amendment tracking.

### Roll-call votes

- Senate votes fetched from `senate.gov` XML feeds; House votes from
  `clerk.house.gov` XML feeds.
- Up to `MAX_VOTES` most-recent vote details per chamber per run (default `50`).
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

For production deployment, run the job via a cron scheduler (e.g., GitHub
Actions `schedule`, Kubernetes CronJob, or AWS EventBridge) using:

```bash
CONGRESS_API_KEY=... DATABASE_URL=... node dist/index.js
```

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
| `SENATE_SESSION` | — | `1` | Senate session (1 or 2) |
| `HOUSE_YEAR` | — | current year | Calendar year for House vote feed |
| `SYNC_SINCE` | — | (none) | ISO-8601 datetime; bills updated after this are fetched |
| `MAX_BILLS` | — | `0` (no limit) | Cap on bills fetched per run |
| `MAX_VOTES` | — | `50` | Max votes per chamber per run |
| `LOG_LEVEL` | — | `info` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
