# CivReveal MVP Launch Runbook

> **Audience:** Engineering team deploying the CivReveal MVP to production.
> **Outcome:** The team can deploy the MVP with a documented, repeatable process.

---

## Table of Contents

1. [Environment Checklist](#1-environment-checklist)
2. [Database Migrations](#2-database-migrations)
3. [Starting the API](#3-starting-the-api)
4. [Starting the Ingestion Job](#4-starting-the-ingestion-job)
5. [Smoke Tests](#5-smoke-tests)
6. [Monitoring & Observability](#6-monitoring--observability)
7. [Rollback Procedure](#7-rollback-procedure)
8. [Known Issues & Limitations](#8-known-issues--limitations)

---

## 1. Environment Checklist

Verify the following environment variables are set before deploying.

### API (`apps/api`)

| Variable              | Required | Description                                              |
|-----------------------|----------|----------------------------------------------------------|
| `DATABASE_URL`        | ✅        | PostgreSQL connection string (`postgres://user:pw@host/db`) |
| `PORT`                | optional | Port the API listens on (default: `3001`)                |
| `HOST`                | optional | Bind address (default: `0.0.0.0`)                        |
| `LOG_LEVEL`           | optional | `trace`/`debug`/`info`/`warn`/`error`/`fatal` (default: `info`) |
| `NODE_ENV`            | ✅        | Must be `production` in production                       |
| `TURNSTILE_SECRET_KEY`| optional | Cloudflare Turnstile server-side secret. Omitting disables bot protection in dev; **required for production sentiment submissions** |

### Web (`apps/web`)

| Variable                  | Required | Description                                  |
|---------------------------|----------|----------------------------------------------|
| `VITE_API_BASE_URL`       | optional | API base URL seen by the browser (default: `http://localhost:3001`) |
| `VITE_TURNSTILE_SITE_KEY` | optional | Cloudflare Turnstile public site key         |

### Ingestion Job (`jobs/ingest-congress`)

| Variable           | Required | Description                                                   |
|--------------------|----------|---------------------------------------------------------------|
| `DATABASE_URL`     | ✅        | Same PostgreSQL connection string as the API                  |
| `CONGRESS_API_KEY` | ✅        | Congress.gov API key (register at <https://api.congress.gov>) |
| `CONGRESS`         | ✅        | Congress number to ingest (e.g. `119`)                        |
| `SENATE_SESSION`   | ✅        | Senate session number (e.g. `1`)                             |
| `HOUSE_YEAR`       | ✅        | House vote year (e.g. `2025`)                                |
| `SYNC_SINCE`       | optional | ISO-8601 date; only ingest records updated after this date    |
| `MAX_BILLS`        | optional | Cap on number of bills to ingest per run (`0` = unlimited)    |
| `MAX_VOTES`        | optional | Cap on number of votes to ingest per run (`0` = unlimited)    |
| `LOG_LEVEL`        | optional | Log verbosity (default: `info`)                              |

---

## 2. Database Migrations

Run migrations **before** starting the API or ingestion job.

```bash
# From the monorepo root
pnpm db:migrate
```

Migrations are idempotent — safe to run multiple times.  Each migration file in
`db/migrations/` is applied exactly once and tracked in the `schema_migrations`
table.

### Verifying migrations

```bash
psql "$DATABASE_URL" -c "SELECT * FROM schema_migrations ORDER BY version;"
```

Expected output includes all migration versions (e.g. `001`, `002`, …).

---

## 3. Starting the API

### Production

```bash
# Build
pnpm --filter @civreveal/api build

# Start (from apps/api)
NODE_ENV=production node dist/index.js
```

Or using the workspace root:

```bash
pnpm --filter @civreveal/api start
```

### Development

```bash
pnpm --filter @civreveal/api dev
```

### Verifying the API is healthy

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","service":"civreveal-api","version":"..."}

curl http://localhost:3001/ready
# Expected: {"status":"ready"} (or "degraded" if DB is unreachable)
```

---

## 4. Starting the Ingestion Job

The ingestion job is a one-shot script — run it on a schedule (e.g. daily cron)
or manually to seed initial data.

```bash
# From the monorepo root
pnpm --filter @civreveal/ingest-congress start
```

Or directly:

```bash
cd jobs/ingest-congress
node --env-file=../../.env dist/index.js
```

The job logs structured JSON to stdout/stderr.  All log lines include a `jobId`
field (the UUID of the `run_start` audit event) for full run correlation.

### Checking ingestion results

```bash
# View recent audit events
curl "http://localhost:3001/audit/events?source=ingest-congress&limit=10"
```

A successful run produces a `run_complete` event.  Failures produce
`fetch_failure` events with error details.

---

## 5. Smoke Tests

Run these manual checks after every deployment.

### API health

```bash
curl http://localhost:3001/health   # → 200 {"status":"ok"}
curl http://localhost:3001/ready    # → 200 {"status":"ready"}
```

### Bills

```bash
# List bills
curl "http://localhost:3001/bills?limit=5"
# Expect: {"data":[...],"total":N,"page":1,"limit":5}

# Single bill (replace ID with a real one from the list above)
curl "http://localhost:3001/bills/<bill-id>"
# Expect: full bill object with title, sponsor, tags, etc.
```

### Politicians

```bash
# List politicians
curl "http://localhost:3001/politicians?limit=5"

# Single politician (replace ID with a real one)
curl "http://localhost:3001/politicians/<politician-id>"
```

### Questionnaire

```bash
# Get questions
curl "http://localhost:3001/questionnaire/questions"
# Expect: array of {id, slug, label} objects

# Submit questionnaire
curl -X POST "http://localhost:3001/questionnaire/submit" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"smoke-test-session","responses":[{"tag":"healthcare","stance":"support"}]}'
# Expect: {"sessionId":"smoke-test-session","profileId":"..."}

# Get matches
curl "http://localhost:3001/questionnaire/matches?sessionId=smoke-test-session"
# Expect: array of match result objects
```

### Sentiment

```bash
# Get sentiment counts for a bill
curl "http://localhost:3001/bills/<bill-id>/sentiments"

# Submit sentiment (dev/test only — no Turnstile required)
curl -X POST "http://localhost:3001/bills/<bill-id>/sentiments" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"smoke-test-session-2","sentiment":"support"}'
# Expect: 201 {"id":"...","sentiment":"support"}
```

### Audit log

```bash
curl "http://localhost:3001/audit/events?limit=5"
# Expect: recent audit events including run_start/run_complete from ingestion
```

---

## 6. Monitoring & Observability

### Structured logs

The API emits JSON-structured logs via pino (built in to Fastify).  Every log
line includes:

- `level` — log severity
- `time` — ISO-8601 timestamp
- `reqId` — UUID request ID for correlating all logs for a single HTTP request
- `msg` — human-readable message

Error responses include a `requestId` field so users can share it for debugging.

The ingestion job emits JSON-structured logs with a `jobId` field bound to every
line in a run, enabling full job-level correlation.

### Key events to monitor

| Event type      | Source           | Meaning                              |
|-----------------|------------------|--------------------------------------|
| `run_start`     | `ingest-congress`| Ingestion job started                |
| `run_complete`  | `ingest-congress`| Ingestion job completed successfully |
| `run_failure`   | `ingest-congress`| Ingestion job encountered a fatal error |
| `fetch_failure` | `ingest-congress`| A step (members/bills/votes) failed  |
| `sentiment_block` | `api`          | Rate limit or bot-check blocked a submission |

Query these via `GET /audit/events?event_type=<type>`.

### Analytics events (product usage)

Client-side analytics events are stored in the same audit log with
`source: 'web-client'`.  Query with:

```bash
curl "http://localhost:3001/audit/events?source=web-client&limit=20"
```

Key events tracked:

| Event                    | Description                          |
|--------------------------|--------------------------------------|
| `bill_detail_viewed`     | User opened a bill detail page       |
| `politician_detail_viewed` | User opened a politician profile   |
| `questionnaire_started`  | User loaded the questionnaire        |
| `questionnaire_completed`| User submitted the questionnaire     |
| `matches_viewed`         | User viewed their match results      |

---

## 7. Rollback Procedure

### API rollback

1. Redeploy the previous Docker image / Git tag.
2. Migrations do **not** need to be reversed for a code-only rollback.
3. If a migration must be rolled back, restore from a pre-migration database
   snapshot and re-run older migrations only.

### Database snapshot (recommended before every deploy)

```bash
pg_dump "$DATABASE_URL" -Fc -f "backup-$(date +%Y%m%d-%H%M%S).dump"
```

### Restore from snapshot

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" backup-<timestamp>.dump
```

---

## 8. Known Issues & Limitations

| Issue | Severity | Notes |
|-------|----------|-------|
| Turnstile bypass in dev/test | Low | `TURNSTILE_SECRET_KEY` must be set in production to enable bot protection for sentiment submissions. |
| No authentication on `/audit/events` | Medium | The audit log endpoint is unauthenticated. Restrict access via reverse-proxy or VPN in production. |
| Analytics stored in `ingestion_events` table | Low | Product analytics and system audit events share the same table. Filter by `source = 'web-client'` for analytics. |
| Ingestion job is single-threaded | Low | Large full syncs may take several minutes. Use `MAX_BILLS`/`MAX_VOTES` to cap runs. |
| No automatic retry on ingestion failures | Low | If a step fails, re-run the job. The upsert logic makes re-runs safe. |
| Scoring defaults to 50% with no vote data | Info | If a politician has no votes on the user's selected topics, their alignment score defaults to 50%. This is by design — see `docs/scoring-methodology.md`. |
