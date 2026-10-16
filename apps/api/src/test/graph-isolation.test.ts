import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantGraph } from "../modules/graph/client.js";
import { getEntity, searchEntities } from "../modules/graph/repository.js";
import { writeEntity } from "../modules/graph/write.js";

const ORG_A = "org_test_graph_a";
const ORG_B = "org_test_graph_b";

beforeAll(async () => {
  await writeEntity(await getTenantGraph(ORG_A), {
    orgId: ORG_A,
    type: "employee",
    id: "emp_iso_a",
    name: "Isolation Tester",
    fields: { role: "QA" },
    isSampleData: true,
  });
});

afterAll(async () => {
  await (await getTenantGraph(ORG_A)).delete();
  await (await getTenantGraph(ORG_B)).delete();
});

describe("graph tenant isolation", () => {
  it("searchEntities does not leak across org graphs", async () => {
    const a = await searchEntities(ORG_A, "Isolation");
    const b = await searchEntities(ORG_B, "Isolation");
    expect(a.map((e) => e.id)).toContain("emp_iso_a");
    expect(b.map((e) => e.id)).not.toContain("emp_iso_a");
  });

  it("getEntity does not leak across org graphs", async () => {
    expect(await getEntity(ORG_A, "emp_iso_a")).not.toBeNull();
    expect(await getEntity(ORG_B, "emp_iso_a")).toBeNull();
  });
});
