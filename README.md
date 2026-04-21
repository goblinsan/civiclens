# CivReveal

A civic-engagement platform for tracking U.S. legislation and understanding how elected representatives vote — helping citizens discover which politicians best reflect their values.

## Repo Structure

```
civiclens/
├── apps/
│   ├── api/          # Fastify REST API (Node 20, TypeScript)
│   └── web/          # React 18 + Vite frontend
├── packages/
│   └── shared/       # Shared Zod schemas, types, and constants
├── jobs/
│   └── ingest-congress/  # Congress.gov data ingestion job
├── db/               # Database migrations (coming soon)
├── docs/             # Extended documentation
├── scripts/          # Utility scripts
├── tsconfig.base.json
├── package.json      # Root workspace package
└── pnpm-workspace.yaml
```

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 |
| Docker | Optional (for local PostgreSQL) |

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-org/civiclens.git
cd civiclens

# 2. Install all workspace dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp jobs/ingest-congress/.env.example jobs/ingest-congress/.env
# Edit each .env file and fill in real values

# 4. Start development servers (runs api + web in parallel)
pnpm dev
```

## Environment Variables

### Root / Shared

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `CONGRESS_API_KEY` | api.congress.gov API key | Yes |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key | Yes |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key | Yes |
| `LOG_LEVEL` | Logging level (`info` default) | No |

### API (`apps/api/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP listen host |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `LOG_LEVEL` | `info` | Pino log level |
| `TURNSTILE_SECRET_KEY` | — | Cloudflare Turnstile secret |

## Dev Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in parallel (web + api) |
| `pnpm build` | Build all packages recursively |
| `pnpm test` | Run all tests recursively |
| `pnpm lint` | Lint all packages recursively |
| `pnpm typecheck` | TypeScript type-check all packages |
| `pnpm format` | Format all files with Prettier |
| `pnpm format:check` | Check formatting without writing |

## Running Individual Apps

```bash
# API only
cd apps/api && pnpm dev   # http://localhost:3001

# Web only
cd apps/web && pnpm dev   # http://localhost:3000
```

The web dev server proxies `/api/*` → `http://localhost:3001` with path rewriting (the `/api` prefix is stripped), so a request to `http://localhost:3000/api/health` is forwarded to `http://localhost:3001/health`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check — returns service metadata |
| `GET` | `/ready` | Readiness check — returns `{ status: "ready" }` |

### Example responses

```jsonc
// GET /health
{
  "status": "ok",
  "service": "civreveal-api",
  "version": "0.0.0",
  "timestamp": "2024-05-01T12:00:00.000Z"
}

// GET /ready
{ "status": "ready" }
```

## Architecture Overview

```
Browser ──► Vite (port 3000)
              │  /api/* proxy
              ▼
         Fastify API (port 3001)
              │
              ▼
         PostgreSQL
```

- **`@civreveal/shared`** — imported by both `api` and `web` via workspace protocol; contains Zod schemas and TypeScript types for Bills, Politicians, Votes, Questionnaire responses, and Match results.
- **`@civreveal/ingest-congress`** — standalone Node.js job that pulls data from [api.congress.gov](https://api.congress.gov) and upserts into the database.

## Contributing

1. Fork and create a feature branch: `git checkout -b feat/my-feature`
2. Make changes; ensure `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, etc.
4. Open a pull request describing your changes
