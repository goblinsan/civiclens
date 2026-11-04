# CivReveal API — runs the Fastify server from the pnpm workspace.
# Built by .github/workflows/api-image.yml and published to GHCR; deployed on the
# home server with deploy/docker-compose.yml.
FROM node:20-alpine
WORKDIR /app

# corepack reads the pnpm version from package.json "packageManager".
RUN corepack enable

# Install with the lockfile first so dependency layers cache across builds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
# Workspace members must exist for pnpm to resolve the lockfile; these are not run in the image.
COPY apps/web/package.json apps/web/
COPY jobs/ingest-congress/package.json jobs/ingest-congress/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile

# The workspace packages are consumed from TypeScript source, so ship source and run through tsx.
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/shared packages/shared

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3001/health >/dev/null || exit 1

USER node
# Run tsx from the workspace install directly: no package-manager download at start-up.
CMD ["./apps/api/node_modules/.bin/tsx", "apps/api/src/index.ts"]
