import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/postgres.js";
import { decodeCursor, encodeCursor } from "../../lib/pagination.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, requirePermission("audit:read"), async (req, res) => {
  const { actor, action, from, to, limit, cursor } = validate(
    z.object({
      actor: z.string().optional(),
      action: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      cursor: z.string().optional(),
    }),
    req.query,
  );

  const conditions = ["org_id = $1"];
  const params: unknown[] = [req.ctx!.orgId];
  if (actor) {
    params.push(actor);
    conditions.push(`actor_user_id = $${params.length}`);
  }
  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`created_at <= $${params.length}`);
  }
  const decoded = cursor ? decodeCursor(cursor) : undefined;
  if (decoded) {
    params.push(decoded.sortKey, decoded.id);
    conditions.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
  }
  params.push(limit + 1);

  const result = await query<{ id: string; actor_user_id: string | null; action: string; resource_type: string; resource_id: string | null; metadata: unknown; created_at: Date }>(
    `SELECT id, actor_user_id, action, resource_type, resource_id, metadata, created_at
     FROM audit_log WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const last = rows[rows.length - 1];
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      actor: r.actor_user_id ?? null,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      timestamp: r.created_at.toISOString(),
      metadata: r.metadata,
    })),
    nextCursor: hasMore && last ? encodeCursor({ sortKey: last.created_at.toISOString(), id: last.id }) : null,
  });
});

export default router;
