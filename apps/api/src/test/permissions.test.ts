import { describe, expect, it } from "vitest";
import { query } from "../db/postgres.js";
import { can } from "../lib/tenant.js";

describe("seeded permission matrix", () => {
  it("viewer has read but not admin permissions", async () => {
    const result = await query<{ permission: string }>(
      "SELECT permission FROM role_permissions WHERE role_id = 'role_viewer'",
    );
    const perms = result.rows.map((r) => r.permission);
    expect(perms).toContain("documents:read");
    expect(perms).toContain("sources:read");
    expect(perms).not.toContain("admin:users");
    expect(perms).not.toContain("actions:approve");
  });

  it("manager has approval but not admin", async () => {
    const result = await query<{ permission: string }>(
      "SELECT permission FROM role_permissions WHERE role_id = 'role_manager'",
    );
    const perms = result.rows.map((r) => r.permission);
    expect(perms).toContain("actions:approve");
    expect(perms).not.toContain("admin:users");
  });
});

describe("can() helper", () => {
  const ctx = {
    orgId: "org_1",
    userId: "usr_1",
    roles: ["viewer"],
    permissions: new Set(["documents:read", "sources:read"]),
    allowedSourceIds: null,
  };

  it("allows a permission the role holds", () => {
    expect(can(ctx, "documents:read")).toBe(true);
  });

  it("denies a permission the role lacks", () => {
    expect(can(ctx, "admin:users")).toBe(false);
  });
});
