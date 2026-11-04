# Home server setup

CivReveal's back end runs on a home server behind the existing Cloudflare
Tunnel; the front end is on Cloudflare Pages. This page is the one-time setup
for the box. Everything after that arrives by `git push`.

What runs where, once this is done:

| Piece | Where | How it gets updated |
| --- | --- | --- |
| Web app (civreveal.org) | Cloudflare Pages | Pages builds `apps/web` on every push to `main` |
| API (api.civreveal.org) | Home server, Docker, port 3001 (loopback, or the LAN address when `cloudflared` is on another box), via the tunnel | `api-image.yml` builds → publishes to GHCR → deploys on the self-hosted runner |
| Ingest job (all four steps incl. Senate) | Home server, self-hosted runner | `ingest.yml`, every 6 h and on demand |
| Database | Neon (unchanged) | — |
| CI (lint/typecheck/test/build) | GitHub-hosted runners | on every PR |

## 0. Before registering anything: lock the repo

The repository is public and a self-hosted runner executes whatever workflow a
run hands it. **GitHub → repo → Settings → Actions → General → Fork pull
request workflows from outside collaborators → "Require approval for all
outside collaborators"** (newer UI: *all external contributors*). Save.

## 1. The box

Any always-on Linux host (x64 or ARM64). Install Docker and the few tools the
jobs use:

```bash
sudo apt update && sudo apt install -y curl tar git jq ca-certificates
curl -fsSL https://get.docker.com | sudo sh
```

Create the runner user, let it use Docker, and create the API's config dir:

```bash
sudo adduser --disabled-password --gecos "" ghrunner
sudo usermod -aG docker ghrunner
sudo mkdir -p /opt/civreveal
```

## 2. API environment file

```bash
sudo curl -fsSL https://raw.githubusercontent.com/goblinsan/civiclens/main/deploy/api.env.example -o /opt/civreveal/api.env
sudo chown ghrunner:ghrunner /opt/civreveal/api.env && sudo chmod 600 /opt/civreveal/api.env
sudo -u ghrunner editor /opt/civreveal/api.env   # set DATABASE_URL (the same value as the GitHub secret)
```

## 3. Start the API once by hand (so the tunnel has something to route to)

```bash
sudo -iu ghrunner
git clone https://github.com/goblinsan/civiclens.git ~/civiclens && cd ~/civiclens
docker compose -f deploy/docker-compose.yml up -d
curl -s http://127.0.0.1:3001/health && echo
curl -s http://127.0.0.1:3001/ready && echo     # expect {"status":"ready"}
exit
```

If `cloudflared` runs on a **different** machine than the API, the container
must bind to this box's LAN address instead of loopback, now and on every later
deploy. The address comes from `CIVREVEAL_BIND_ADDR` (compose default
`127.0.0.1`); prefix the `up` command with it here, and set it for the runner
in step 5 so deploys use the same value:

```bash
CIVREVEAL_BIND_ADDR=<api-host-lan-ip> docker compose -f deploy/docker-compose.yml up -d
curl -s http://<api-host-lan-ip>:3001/health && echo
```

Build the image locally the first time — it both validates the Dockerfile and
avoids depending on the registry before `api-image.yml` has run on `main`:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/goblinsan/civreveal-api:latest .
```

(Later pulls come from GHCR, which is public; no login needed.)

## 4. Tunnel route

In the existing Cloudflare Tunnel (Zero Trust → Networks → Tunnels → the
tunnel → Public Hostname → Add):

| Field | Value |
| --- | --- |
| Subdomain | `api` |
| Domain | `civreveal.org` |
| Type | `HTTP` |
| URL | `localhost:3001` when `cloudflared` runs on the API box; otherwise `<api-host-lan-ip>:3001`, with `CIVREVEAL_BIND_ADDR=<api-host-lan-ip>` set for the container (step 3) and for the runner (step 5) |

Cloudflare creates the DNS record. Verify from anywhere:

```bash
curl -s https://api.civreveal.org/health && echo
curl -s https://api.civreveal.org/stats | jq
```

## 5. Register the self-hosted runner

**GitHub → repo → Settings → Actions → Runners → New self-hosted runner → Linux**,
then as the runner user:

```bash
sudo -iu ghrunner
mkdir -p ~/actions-runner && cd ~/actions-runner
# paste the curl + tar + ./config.sh lines GitHub shows; when config.sh asks for
# additional labels, enter:   civreveal-home
exit
cd /home/ghrunner/actions-runner && sudo ./svc.sh install ghrunner && sudo ./svc.sh start
```

Settings → Actions → Runners should show it **Idle** with labels `self-hosted`,
`Linux`, `X64`/`ARM64`, `civreveal-home`.

If the API binds to a LAN address (step 3), give the runner the same value so
every deploy keeps it. The runner reads `~/actions-runner/.env` into each job's
environment:

```bash
echo 'CIVREVEAL_BIND_ADDR=<api-host-lan-ip>' | sudo -u ghrunner tee -a /home/ghrunner/actions-runner/.env
cd /home/ghrunner/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh start
```

The deploy job prints `API bound to <addr>:3001` and waits for `/health` on
that address.

## 6. Cloudflare Pages: serve the real app

In the `civiclens` Pages project → Settings → Builds & deployments:

| Setting | Value |
| --- | --- |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @civreveal/web build` |
| Build output directory | `apps/web/dist` |
| Root directory | *(leave blank)* |

Environment variables (Production):

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `20` |
| `VITE_API_BASE_URL` | `https://api.civreveal.org` |

Retry the latest deployment. `https://civreveal.org` now serves the app;
`/bot` and `/.well-known/http-message-signatures-directory` keep their URLs
(they live in `apps/web/public/`).

## 7. First runs

- **Actions → API image → Run workflow**: proves the build → publish → deploy
  path end to end (the deploy job runs on your runner and waits for `/health`).
- **Actions → Ingest Congress data → Run workflow** with defaults: the first
  ingest from home, Senate step included. Members, bills and House votes
  should complete as before. The Senate step is still subject to senate.gov's
  Akamai bot protection: until the CivRevealBot registration is accepted it
  may answer HTTP 403 even from here (the first home run did). The error line
  in the summary carries the Akamai reference number from the block page;
  quote it when following up with the Senate webmaster.

## Verification checklist

```bash
curl -s https://api.civreveal.org/health
curl -s https://api.civreveal.org/stats | jq
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://civreveal.org' https://api.civreveal.org/bills?limit=1   # 200 with CORS headers
curl -sI https://civreveal.org/.well-known/http-message-signatures-directory | grep -i '^signature'
```

Then open https://civreveal.org → Browse Bills.

## Operating notes

- Logs: `docker logs -f civreveal-api` (JSON lines, one per request).
- The API container restarts on reboot (`restart: unless-stopped`); the
  runner is a systemd service; `cloudflared` is whatever you already run.
- `CIVREVEAL_BIND_ADDR` lives in `~/actions-runner/.env` (and nowhere in the
  repo). If a deploy ever comes up on loopback while the tunnel targets the
  LAN address, that file lost the line or the runner service was not
  restarted after editing it.
- To roll back: `docker compose -f deploy/docker-compose.yml pull` with a
  specific tag edited into the compose file (`civreveal-api:<git sha>`), or
  re-run the API image workflow from an earlier commit.
- The box holds `DATABASE_URL`. Treat it as a machine that knows the database
  password.
