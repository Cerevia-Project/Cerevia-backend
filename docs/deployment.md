# Deployment

Hosted target: **Render** (managed PostgreSQL + Redis included; only the API and
FalkorDB need Docker). This is defined as infrastructure-as-code in `render.yaml`.

| Piece | Where |
| --- | --- |
| API (Express) | Render **web service** (Docker) |
| FalkorDB | Render **private service** (Docker) — internal-only |
| PostgreSQL | Render **managed Postgres** |
| Redis (BullMQ) | Render **managed Redis** (Key Value) |
| Object storage | Cloudflare R2 (S3-compatible) |
| LLM + embeddings | env vars only (Anthropic + Voyage) |

## Local development

```sh
pnpm install
docker compose up -d            # FalkorDB (6379), Postgres (5433), Redis (6380)
cp .env.example .env            # fill in FALKORDB_PASSWORD + API keys
pnpm --filter api migrate       # schema + seed roles
pnpm --filter api bootstrap     # default org + admin user
pnpm dev                        # http://localhost:3001
```

Dev uses the filesystem storage backend (`.data/uploads`).

## Deploy-enabling config (already implemented)

- **CORS**: `FRONTEND_ORIGIN` enables `Access-Control-Allow-Origin` + credentials.
- **Cookie**: `SameSite=None; Secure` automatically when `FRONTEND_ORIGIN` is set.
- **Postgres**: `DATABASE_URL` (connection string) is preferred; otherwise
  `POSTGRES_HOST/PORT/USER/PASSWORD/DB` + `POSTGRES_SSL=true` when TLS is required.
- **Redis**: `REDIS_URL` (a `rediss://…` URL) overrides `REDIS_HOST`/`REDIS_PORT`.
- **Auto-migrate**: in production or with `AUTO_MIGRATE=true`, the server runs
  migrations + bootstrap on boot (idempotent). SQL is copied into `dist/`.
- **Storage**: `STORAGE_BACKEND=s3` with R2 credentials.

## Deploy to Render (Blueprint)

1. Push the repo to GitHub.
2. In Render → **New → Blueprint**, select the repo. Render reads `render.yaml`
   and creates: `cerevia-api` (web), `cerevia-falkordb` (private), `cerevia-redis`
   (Key Value), and `cerevia-db` (Postgres).
3. Fill in the `sync: false` secrets when prompted (API keys, S3/R2 keys,
   `FRONTEND_ORIGIN`, `BOOTSTRAP_ADMIN_PASSWORD`).
4. Deploy. Render gives the API a `https://cerevia-api.onrender.com` URL.

FalkorDB runs **passwordless** because it is a private service (reachable only from
services in this Render project). The API reaches it at `cerevia-falkordb:6379`.
If you prefer a password, add `REDIS_ARGS=--requirepass <pw> --appendonly yes` to
the `cerevia-falkordb` service and `FALKORDB_PASSWORD=<pw>` to `cerevia-api`.

## Object storage (Cloudflare R2)

1. Create a bucket + S3 API token.
2. Set `S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`, `S3_REGION=auto`,
   `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE=true`.
   (`STORAGE_BACKEND=s3` is already set in the Blueprint.)

## Handoff to frontend

- API base: `https://cerevia-api.onrender.com`.
- Seed the demo company once: `POST /api/v1/demo/load` (admin).
- Frontend logs in with `admin@cerevia.dev` + the bootstrap password; the session
  cookie + `X-CSRF-Token` flow works cross-origin via the CORS/cookie config.

## Render free-tier caveats

- Free **web services** sleep after ~15 min of inactivity (first request wakes it,
  ~50s cold start). Upgrade to the `starter` plan to avoid sleeping.
- Free **Postgres** expires after 30 days. Use a paid plan for anything persistent.
- FalkorDB is in-memory by default; add a Render **disk** to `cerevia-falkordb` if
  you need the graph to survive restarts.

## Production checklist

- `NODE_ENV=production` (Secure cookies); HTTPS is automatic on Render.
- FalkorDB: confirm the version's license terms for your deployment.
- The BullMQ worker runs in-process with the API (fine for one service); split it
  out before scaling horizontally.

## Build & scripts

```sh
pnpm build                     # tsc → apps/api/dist + copies SQL migrations
pnpm --filter api start        # node dist/index.js
pnpm --filter api test         # vitest
pnpm --filter api eval         # agent evaluation harness
pnpm contracts:generate        # regenerate types from openapi.yaml
```
