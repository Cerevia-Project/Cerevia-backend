import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query } from "../db/postgres.js";
import * as docsRepo from "../modules/documents/repository.js";
import * as ingestionRepo from "../modules/ingestion/repository.js";
import * as sourcesRepo from "../modules/sources/repository.js";

const ORG_A = "org_test_tenant_a";
const ORG_B = "org_test_tenant_b";

beforeAll(async () => {
  // Clean slate (cascades to sources/documents/jobs via FK).
  await query("DELETE FROM organizations WHERE id IN ($1, $2)", [ORG_A, ORG_B]);

  await query("INSERT INTO organizations (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')", [ORG_A, ORG_B]);
  await query(
    "INSERT INTO sources (id, org_id, name, type) VALUES ('src_a', $1, 'A source', 'upload'), ('src_b', $2, 'B source', 'upload')",
    [ORG_A, ORG_B],
  );
  await query(
    "INSERT INTO documents (id, org_id, source_id, title) VALUES ('doc_a', $1, 'src_a', 'Doc A'), ('doc_b', $2, 'src_b', 'Doc B')",
    [ORG_A, ORG_B],
  );
  await query(
    "INSERT INTO ingestion_jobs (id, org_id, source_id, document_id) VALUES ('job_a', $1, 'src_a', 'doc_a'), ('job_b', $2, 'src_b', 'doc_b')",
    [ORG_A, ORG_B],
  );
});

afterAll(async () => {
  await query("DELETE FROM organizations WHERE id IN ($1, $2)", [ORG_A, ORG_B]);
  await closePool();
});

describe("tenant isolation", () => {
  it("lists only the caller org's sources", async () => {
    const a = await sourcesRepo.listSources(ORG_A, 25);
    expect(a.rows.map((r) => r.id)).toEqual(["src_a"]);
    const b = await sourcesRepo.listSources(ORG_B, 25);
    expect(b.rows.map((r) => r.id)).toEqual(["src_b"]);
  });

  it("does not leak a source across orgs", async () => {
    expect(await sourcesRepo.getSource(ORG_A, "src_b")).toBeNull();
    expect(await sourcesRepo.getSource(ORG_B, "src_a")).toBeNull();
  });

  it("does not leak documents across orgs", async () => {
    expect(await docsRepo.getDocument(ORG_A, "doc_b")).toBeNull();
    expect(await docsRepo.getDocument(ORG_B, "doc_a")).toBeNull();
  });

  it("does not leak ingestion jobs across orgs", async () => {
    expect(await ingestionRepo.getJob(ORG_A, "job_b")).toBeNull();
    expect(await ingestionRepo.getJob(ORG_B, "job_a")).toBeNull();
  });
});
