# Cerevia-backend

Intelligence layer for Cerevia: knowledge graph, hybrid retrieval, and a
controlled assistant agent. **Express + TypeScript + FalkorDB**, with PostgreSQL
for identity/workflow, Redis/BullMQ for the ingestion queue, and S3-compatible
object storage (LocalStack in dev).

This is a pnpm-workspace monorepo:

```
apps/
  api/                 # Express API (source of the backend)
packages/
  contracts/           # OpenAPI 3.1 contract, fixtures, mock server
docs/
  adr/                 # Architecture decision records
```

## Prerequisites

- Node.js 20+ (developed on 22)
- pnpm 10.20.0 (Corepack or `corepack enable`)
- Docker + Docker Compose

## Getting started

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Start the services (FalkorDB, PostgreSQL, Redis, LocalStack S3):

   ```sh
   docker compose up -d
   ```

3. Copy `.env.example` to `.env` and fill in `FALKORDB_PASSWORD`:

   ```sh
   cp .env.example .env
   ```

4. Run the API:

   ```sh
   pnpm dev          # tsx watch, http://localhost:3001
   ```

## Scripts

| Script                  | Description                                   |
| ----------------------- | --------------------------------------------- |
| `pnpm dev`              | Run the API with hot reload                   |
| `pnpm build`            | Compile all packages (tsc)                    |
| `pnpm typecheck`        | Type-check all packages                       |
| `pnpm --filter api test`| Run the test suite (vitest)                   |
| `pnpm --filter api migrate` | Apply SQL migrations + seed roles        |
| `pnpm --filter api bootstrap` | Seed default org + admin user           |
| `pnpm --filter api eval` | Run the agent evaluation harness             |
| `pnpm contracts:generate` | Generate TS types from `openapi.yaml`       |
| `pnpm contracts:mock`   | Serve the contract with Prism (port 4010)     |
| `pnpm contracts:lint`   | Lint the contract with Spectral               |

## The contract

`packages/contracts/openapi.yaml` is the source of truth, versioned under
`/api/v1`. Both the backend and any frontend generate types from it. A Prism
mock server serves the contract plus `packages/contracts/fixtures/*.json` so a
frontend can be built with zero backend dependency:

```sh
pnpm contracts:generate   # -> packages/contracts/src/types.d.ts
pnpm contracts:mock       # mock API on http://localhost:4010
```

## Services (Docker Compose)

| Service  | Host port | Purpose                              |
| -------- | --------- | ------------------------------------ |
| falkordb | 6379, 3000| Graph + vector (one graph per org)   |
| postgres | 5433      | Identity, RBAC, workflow, audit      |
| redis    | 6380      | BullMQ queue (separate from FalkorDB)|

Object storage uses a **filesystem backend** in dev (`.data/uploads`); set
`STORAGE_BACKEND=s3` to use an S3-compatible store.

## Environment variables

See `.env.example` for the full list. Core variables: `PORT`,
`FALKORDB_*`, `POSTGRES_*`, `REDIS_*`, `S3_*`, `ANTHROPIC_API_KEY`,
`VOYAGE_API_KEY`.
