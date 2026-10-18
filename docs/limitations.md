# Known limitations

Tracked honestly. Each item is a deliberate scope decision for this increment.

## Security

- **Postgres RLS is not yet enabled.** Tenant isolation is enforced by explicit
  `org_id` scoping in every repository query (primary defense, covered by tests).
  RLS + a non-superuser app role + `SET LOCAL app.org_id` is the planned second
  line of defense.
- **Rate limiting is in-memory** (single instance). The `api_rate_limits` table
  exists for a distributed limiter.
- **Malware scan hook and deep MIME sniffing** are not wired (extension allowlist
  + size cap only).

## Graph & extraction

- **Entity resolution is exact-name+type hashing.** Deterministic keys (email,
  employee id, ticket key) first, then fuzzy candidate merges, are not implemented.
- **Version handling** (`SUPERSEDES`, `validTo`/`current=false`) is not implemented;
  re-uploading the same document creates a new document rather than a new version.
- **`/graph/paths`** returns an empty stub; entity `/history` returns an empty stub.

## Assistant

- **Message processing is synchronous** — `POST …/messages` runs the agent inline
  (slow) rather than enqueueing. The SSE stream **replays** the stored answer
  rather than streaming live generation.
- **Multi-org login** picks the user's first membership.

## Company intelligence

- **Conflict detection is basic** — entities with 2+ `SUPPORTED_BY` passages are
  flagged as `contradiction` candidates. Authority/lineage/date weighting and
  version-aware comparison are not implemented.
- **Decision revisions + evidence trace (`validity`)** are stubs.
- **A decision may have no owner or approver.** Extraction cannot always
  establish one, so `DecisionSummary.owner` and `DecisionDetail.approver` are
  nullable in the contract and the UI states the absence rather than hiding it.

## Actions

- **No execution stage** — approved proposals remain `approved` (exportable drafts)
  because v1 has no implemented connectors.
- **Proposal drafts are template-based** — the agent-side `prepare_action_proposal`
  tool is not yet wired for LLM-generated drafts.

## Connectors

- **No connector is implemented.** `GET /connectors` lists the catalog with
  every entry `state: planned`, and the UI makes a planned connector
  non-interactive. v1 ingests by upload only.

## Infrastructure

- **Voyage free tier is 3 RPM** — vector search falls back to keyword search under
  load. Add a payment method to Voyage, or add embedding caching, to lift this.
- **Two FalkorDB connections** exist (health check + graph module); consolidate later.
