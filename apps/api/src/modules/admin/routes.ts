import { Router } from "express";
import { z } from "zod";
import { hash } from "argon2";
import { randomBytes } from "node:crypto";
import { query, withTransaction } from "../../db/postgres.js";
import { newId } from "../../lib/ids.js";
import { pathParam } from "../../lib/params.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";

const router = Router();

router.get("/users", requireAuth, requirePermission("admin:users"), async (req, res) => {
  const result = await query<{ id: string; email: string; name: string; is_sample_data: boolean; role_name: string | null }>(
    `SELECT u.id, u.email, u.name, u.is_sample_data, r.name AS role_name
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id AND m.org_id = $1
     LEFT JOIN roles r ON r.id = m.role_id
     WHERE m.org_id = $1
     ORDER BY u.created_at ASC`,
    [req.ctx!.orgId],
  );
  res.json({
    items: result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      isSampleData: row.is_sample_data,
    })),
  });
});

router.post("/users", requireAuth, requirePermission("admin:users"), async (req, res) => {
  const { email, name, password, role } = validate(
    z.object({
      email: z.string().email(),
      name: z.string().min(1),
      password: z.string().min(8).optional(),
      role: z.string().optional(),
    }),
    req.body,
  );
  const passwordHash = await hash(password ?? randomBytes(16).toString("hex"));
  const userId = newId("usr");

  await withTransaction(async (client) => {
    await client.query("INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)", [
      userId,
      email,
      name,
      passwordHash,
    ]);
    await client.query(
      "INSERT INTO memberships (id, org_id, user_id, role_id) VALUES ($1, $2, $3, $4)",
      [newId("mem"), req.ctx!.orgId, userId, role ?? "role_viewer"],
    );
  });

  res.status(201).json({ id: userId, email, name, isSampleData: false });
});

router.get("/roles", requireAuth, requirePermission("admin:roles"), async (_req, res) => {
  const result = await query<{ id: string; name: string; permissions: string[] }>(
    `SELECT r.id, r.name, COALESCE(array_agg(rp.permission) FILTER (WHERE rp.permission IS NOT NULL), '{}') AS permissions
     FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
     GROUP BY r.id, r.name ORDER BY r.name ASC`,
  );
  res.json({ items: result.rows });
});

router.get("/permissions", requireAuth, requirePermission("admin:roles"), async (_req, res) => {
  const result = await query<{ permission: string }>("SELECT DISTINCT permission FROM role_permissions ORDER BY permission ASC");
  res.json({ items: result.rows.map((r) => r.permission) });
});

router.get("/organization", requireAuth, requirePermission("admin:organization"), async (req, res) => {
  const result = await query<{ id: string; name: string }>("SELECT id, name FROM organizations WHERE id = $1", [req.ctx!.orgId]);
  res.json(result.rows[0] ?? { id: req.ctx!.orgId, name: "" });
});

router.get("/sources/:id/access", requireAuth, requirePermission("admin:sources"), async (req, res) => {
  const result = await query<{ principal_type: string; principal_id: string; permission: string }>(
    "SELECT principal_type, principal_id, permission FROM source_acls WHERE org_id = $1 AND source_id = $2",
    [req.ctx!.orgId, pathParam(req, "id")],
  );
  res.json({
    sourceId: pathParam(req, "id"),
    grants: result.rows.map((r) => ({ principalType: r.principal_type, principalId: r.principal_id, permission: r.permission })),
  });
});

router.put("/sources/:id/access", requireAuth, requirePermission("admin:sources"), async (req, res) => {
  const sourceId = pathParam(req, "id");
  const { grants } = validate(
    z.object({
      grants: z.array(
        z.object({
          principalType: z.enum(["user", "role", "team"]),
          principalId: z.string().min(1),
          permission: z.enum(["read", "write"]),
        }),
      ),
    }),
    req.body,
  );

  await withTransaction(async (client) => {
    await client.query("DELETE FROM source_acls WHERE org_id = $1 AND source_id = $2", [req.ctx!.orgId, sourceId]);
    for (const g of grants) {
      await client.query(
        "INSERT INTO source_acls (id, org_id, source_id, principal_type, principal_id, permission) VALUES ($1, $2, $3, $4, $5, $6)",
        [newId("acl"), req.ctx!.orgId, sourceId, g.principalType, g.principalId, g.permission],
      );
    }
  });

  res.json({ sourceId, grants });
});

router.get("/audit", requireAuth, requirePermission("admin:audit"), async (req, res) => {
  const result = await query<{ id: string; actor_user_id: string | null; action: string; resource_type: string; resource_id: string | null; metadata: unknown; created_at: Date }>(
    "SELECT id, actor_user_id, action, resource_type, resource_id, metadata, created_at FROM audit_log WHERE org_id = $1 ORDER BY created_at DESC LIMIT 100",
    [req.ctx!.orgId],
  );
  res.json({ items: result.rows.map((r) => ({ id: r.id, actor: r.actor_user_id, action: r.action, resourceType: r.resource_type, resourceId: r.resource_id, timestamp: r.created_at.toISOString(), metadata: r.metadata })), nextCursor: null });
});

export default router;
