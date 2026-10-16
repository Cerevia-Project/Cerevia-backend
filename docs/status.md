# Build status

Updated per phase. Feature-by-feature build of the Cerevia backend.

## B0 — Contract & scaffolding — ✅ complete

- pnpm-workspace monorepo: `apps/api`, `packages/contracts`.
- OpenAPI 3.1 contract (`packages/contracts/openapi.yaml`), 8 fixtures, generated
  types (`openapi-typescript`), Spectral lint clean, Prism mock.
- Docker Compose: FalkorDB, PostgreSQL, Redis (BullMQ).
- FalkorDB feasibility spike → ADR 0001.
- CI (GitHub Actions): install → typecheck → contract lint → build.

## B6 — Hardening — ✅ core complete

- Security tests: graph tenant isolation + permission matrix (10 tests total).
- Evaluation harness (`pnpm --filter api eval`): golden Q&A + a prompt-injection
  case, scoring answer status, citation presence, and injection resistance.
- Deployment docs (`docs/deployment.md`) and a comprehensive `docs/limitations.md`.

### Outstanding / deferred (see docs/limitations.md)

- Postgres RLS second-line-of-defense, distributed rate limiting.
- Entity-resolution refinement, version handling (`SUPERSEDES`).
- Async message processing + live SSE; multi-org login selection.

## B5 — Actions & approvals — ✅ complete

- Proposal lifecycle: create (`draft`) → edit → approve (`approved`) / reject (`rejected`),
  with an `approvals` row + audit record on every state change.
- `actions:approve` gate on approve/reject; `proposals:create` on create/edit.
- `GET /audit` (filters) and `/admin/*` (users, roles, permissions, source ACLs,
  organization, audit).
- Verified end-to-end: create/edit/approve/reject + audit trail + 5 roles listed.

### Outstanding / deferred

- Execution stage (`executing → executed | failed`) — v1 has no implemented
  connectors, so approved proposals remain `approved` (exportable draft).
- LLM draft generation (proposals are created from templates; agent-side
  `prepare_action_proposal` tool not yet wired).

## B4 — Company intelligence — ✅ core complete

- Projects: list/detail, tasks, dependencies, risks (`kind`+`severity`), launch-readiness.
- Decisions: list/detail with rationale + alternatives.
- People/teams/expertise discovery (reads the graph).
- Conflict detection (basic: 2+ `SUPPORTED_BY` passages ⇒ `contradiction` candidate) + PATCH.
- Demo data loader (`POST /demo/load`): 3 teams, 6 employees, 1 project, 3 tasks, 1 decision.
- Agent tools `get_project_status`, `search_decisions`, `find_expertise` now wired to real data.
- Verified: Payments Launch `at_risk/high`, blocked gateway risk, `at_risk` readiness,
  decision rationale, expertise search (Ada/Katherine/Margaret).

### Outstanding / deferred

- Decision revisions + evidence trace (`validity`) are stubs.
- Full conflict detection algorithm (authority/lineage/date weighting) and version
  handling (`SUPERSEDES`) — basic candidate detection only.

## B3 — Retrieval & assistant — ✅ core complete

- Hybrid retrieval (FalkorDB): vector (`vecf32`) + full-text, merged and re-ranked;
  falls back to keyword search if embedding is rate-limited.
- Bounded agent loop (`claude-opus-5-5`): tenant-scoped tools (`search_documents`,
  `search_entities`, `get_entity_details`, `traverse_relationships` + B4 stubs),
  citation guard, evidence-typed claims (`confirmed`/`inferred`/…).
- Conversations: threads + messages CRUD, `POST …/messages` → 202, non-streaming
  answer, evidence endpoint, SSE replay (`status/text_delta/claim/citation/done`).
- Verified end-to-end: question → answer with claims + citations + stream.

### Outstanding / deferred

- Real async message processing (currently the agent runs synchronously in POST).
- Live SSE during generation (currently replays the stored answer).
- Voyage free tier is **3 RPM** — vector search falls back to keyword under load;
  add a payment method to Voyage (or add embedding caching) to lift this.

## B2 — Graph & extraction — ✅ complete

- `GraphClient` adapter (only `graph/` touches the `falkordb` driver); one graph per org.
- Idempotent schema migration: range index + unique `(orgId, id)` constraint per node
  label, full-text + vector indexes on `Chunk` (syntax from ADR 0001).
- Graph write helpers (MERGE): documents, chunks (+`vecf32` embeddings), `HAS_CHUNK`
  and typed relationships with provenance.
- Ingestion writes documents + chunks + embeddings + entities/relationships.
- **Live extraction verified** (`claude-opus-5-5` strict tool) → entities + typed
  relationships (`OWNS`, `RESPONSIBLE_FOR`, `SUPPORTED_BY`, …) with passages.
- **Live embeddings verified** (Voyage `voyage-3-large`, 1024-dim) on chunks.
- `/graph/search`, `/graph/entities/{id}`, `/neighbors`, `/edges/{id}`, `/schema` verified.

### Outstanding / deferred

- Entity resolution refinement (deterministic keys first, fuzzy → candidate merges);
  currently exact-name+type hashing.
- Version handling (`SUPERSEDES`), entity history, and real `/graph/paths`.

## B1 — Core platform — ✅ complete

- Auth: Argon2id login/logout/session, httpOnly SameSite=Lax session cookie, CSRF.
- RBAC: 5 seeded roles + 34 permissions; `requireAuth` / `requirePermission`.
- Sources CRUD + ACL schema; document upload (multipart) → storage → ingestion job.
- Documents list/detail/content endpoints.
- Ingestion pipeline (BullMQ): validate → store → extract text (PDF/DOCX/TXT/MD/CSV/JSON)
  → chunk; entity/embedding/graph stages are recorded stubs for B2.
- Audit log, rate limiting, RFC 9457 errors, cursor pagination, prefixed IDs.
- Cross-tenant isolation tests (4 passing).

### Outstanding / deferred

- `/overview`, `/connectors`, `/demo/load`, ingestion `/events` (SSE) endpoints.
- Content-hash re-upload dedupe (B2 version handling).
- Postgres RLS second-line-of-defense (hardening, B6).
- Multi-org login selection (currently picks the first membership).
- Real S3 deployment (dev uses the filesystem backend).

## Known infrastructure notes

- Docker PostgreSQL is on host port **5433** (a native Windows PostgreSQL already
  occupies 5432).
- MinIO and LocalStack both ended free image distribution in 2025–2026, so object
  storage uses a **filesystem backend** in dev (`.data/uploads`); the S3 client
  backend remains for real deployments (`STORAGE_BACKEND=s3`).
