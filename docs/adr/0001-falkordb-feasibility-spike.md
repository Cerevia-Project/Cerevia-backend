# ADR 0001 — FalkorDB feasibility spike

- **Status:** Accepted
- **Date:** 2026-10-16
- **Deciders:** favourAyomikun
- **Context:** Phase B0 spike to verify FalkorDB can support the schema and query
  patterns the Cerevia plan depends on: per-tenant graphs, vector + full-text
  indexes, unique constraints, idempotent MERGE, and the Node.js client.

## Verified findings (against `falkordb/falkordb:latest`, client `falkordb@6.8.0`)

### Client surface
- `FalkorDB.connect({ host, port, password })` → a `FalkorDB` handle.
- `db.selectGraph(name)` returns a `Graph` **synchronously** (do not `await` it).
- `db.list()` lists graph names; `graph.delete()` removes a graph.
- `graph.query(cypher, { params, TIMEOUT })` → `{ headers, data, metadata }`.
- `graph.roQuery(...)` for read-only queries; `graph.explain(...)` / `profile(...)`
  for query plans.

### Per-tenant graphs
- One graph per org (`org_<id>`) works. A graph is created lazily on first query
  and appears in `db.list()`. The repository must select the tenant graph from
  `TenantContext`, never from client input.

### Indexes (client methods emit the Cypher below)
- Range / exact-match: `graph.createNodeRangeIndex("Employee", "orgId", "id")`
  → `CREATE INDEX FOR (e:Employee) ON (e.orgId, e.id)`.
- Full-text: `graph.createNodeFulltextIndex("Chunk", "text")`
  → `CREATE FULLTEXT INDEX FOR (e:Chunk) ON (e.text)`.
- Vector: `graph.createNodeVectorIndex("Chunk", 1024, "cosine", "embedding")`
  → `CREATE VECTOR INDEX ... OPTIONS {dimension:1024, similarityFunction:'cosine'}`.

### Unique constraints (gotcha)
- A UNIQUE constraint **requires a range (exact-match) index on the same
  properties first**, otherwise creation fails with
  `missing supporting exact-match index`.
- Constraints are created via the Redis command `GRAPH.CONSTRAINT CREATE`
  (`graph.constraintCreate(...)`), **not** Cypher `CREATE CONSTRAINT` (rejected).
- Creation is asynchronous; poll `CALL db.constraints()` until `status` is
  `OPERATIONAL`. Duplicate inserts then throw
  `unique constraint violation on node of type <Label>`.

### Full-text query
- `CALL db.idx.fulltext.queryNodes('Chunk', 'payment') YIELD node, score`
  — the procedure takes **label + query string** (two args, not label/property/query).
- Supports wildcard `term*` and fuzzy `%term%distance`.

### Vector query (gotcha)
- `CALL db.idx.vector.queryNodes('Chunk', 'embedding', 5, vecf32($q))
  YIELD node, score`
  — `k` is top-k; the query vector must be wrapped in `vecf32(...)`.
- Parameters work: pass a JS `number[]` as `$q` inside `vecf32($q)`.
- **`score` is a distance, not similarity** — smaller is more similar. For
  `cosine` it behaves as `1 - cosine_similarity`. Order ascending, or interpret
  accordingly.
- Post-filtering works: `... YIELD node, score WHERE node.orgId = 'org_1'`
  correctly narrows results, so org + source-ACL filters can be applied inside
  the query before results reach the caller.

### Idempotency
- `MERGE (n:Label {orgId, id}) ON CREATE SET ...` is idempotent (two merges ⇒
  one node). Ingestion can use idempotent MERGE batches; there are no
  multi-query transactions, so resumable progress stays in Postgres.

## Decisions
1. Keep FalkorDB for graph + vector (no separate vector DB).
2. Vector dimension is pinned to the embedding model (`voyage-3-large` → 1024);
   changing the model means re-embedding and re-indexing.
3. All queries go through parameterized templates; every template includes the
   `orgId` predicate and source-ACL filter, verified by unit tests.
4. Unique constraints are always preceded by their supporting range index in the
   versioned schema migration, and the migration polls for `OPERATIONAL`.

## Consequences
- `score` semantics (distance vs similarity) must be handled uniformly in
  retrieval re-ranking.
- Constraint/index creation is async; migrations and tests must account for it.
- No multi-query transactions in FalkorDB; ingestion relies on idempotent MERGE
  + Postgres job state.
