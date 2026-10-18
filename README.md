# Cerevia-backend

Intelligence layer for Cerevia: knowledge graph, hybrid retrieval, and a
controlled, citation-grounded assistant. **Express + TypeScript + FalkorDB**, with
PostgreSQL for identity/workflow, Redis/BullMQ for the ingestion queue, and a
pluggable LLM provider (Gemini by default, Anthropic optional) plus Voyage AI
embeddings.

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

2. Start the services (FalkorDB, PostgreSQL, Redis):

   ```sh
   docker compose up -d
   ```

3. Copy `.env.example` to `.env` and fill in the API keys you want to use
   (`FALKORDB_PASSWORD` is optional — leave it empty for passwordless local dev):

   ```sh
   cp .env.example .env
   ```

4. Run the API:

   ```sh
   pnpm dev          # tsx watch, http://localhost:3001
   ```

## LLM provider

The assistant and entity/relation extraction run through a provider abstraction,
selected by `LLM_PROVIDER`:

| Provider | `LLM_PROVIDER` | Env vars |
| --- | --- | --- |
| Gemini (default) | `gemini` | `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-flash-latest`) |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (`claude-opus-5-5`) |

Embeddings are separate and always use Voyage AI (`VOYAGE_API_KEY`,
`VOYAGE_MODEL`, `VOYAGE_EMBEDDING_DIMENSION`). Without a configured provider or
embedding key, ingestion and answers degrade gracefully (keyword-only search, no
extraction).

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

| Service  | Host port                    | Purpose                              |
| -------- | ---------------------------- | ------------------------------------ |
| falkordb | `6379` (graph), `3100` (UI)  | Graph + vector + full-text (one graph per org) |
| postgres | `5433`                       | Identity, RBAC, workflow, audit      |
| redis    | `6380`                       | BullMQ queue (separate from FalkorDB)|

Object storage uses a **filesystem backend** in dev (`.data/uploads`); set
`STORAGE_BACKEND=s3` and the `S3_*` variables to use an S3-compatible store.

## Environment variables

See `.env.example` for the full list. Core variables: `PORT`, `LLM_PROVIDER`,
`GEMINI_*` / `ANTHROPIC_*`, `VOYAGE_*`, `FALKORDB_*`, `POSTGRES_*` (or
`DATABASE_URL`), `REDIS_*` (or `REDIS_URL`), `S3_*`, `STORAGE_BACKEND`,
`FRONTEND_ORIGIN`, `AUTO_MIGRATE`, `BOOTSTRAP_*`.
