import { Router } from "express";
import { z } from "zod";
import { pathParam } from "../../lib/params.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import * as repo from "./repository.js";

const router = Router();

router.get("/search", requireAuth, requirePermission("documents:read"), async (req, res) => {
  const { q, types } = validate(
    z.object({ q: z.string().min(1), types: z.string().optional() }),
    req.query,
  );
  const items = await repo.searchEntities(req.ctx!.orgId, q, types ? types.split(",") : undefined);
  res.json({ items, nextCursor: null });
});

router.get("/schema", requireAuth, requirePermission("documents:read"), (_req, res) => {
  res.json(repo.getSchema());
});

router.get("/entities/:id", requireAuth, requirePermission("documents:read"), async (req, res) => {
  const entity = await repo.getEntity(req.ctx!.orgId, pathParam(req, "id"));
  if (!entity) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Entity not found" });
    return;
  }
  res.json(entity);
});

router.get("/entities/:id/neighbors", requireAuth, requirePermission("documents:read"), async (req, res) => {
  const { edgeTypes, direction, depth, limit } = validate(
    z.object({
      edgeTypes: z.string().optional(),
      direction: z.enum(["in", "out", "both"]).default("both"),
      depth: z.coerce.number().int().min(1).max(3).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
    req.query,
  );
  // depth > 1 is a single-hop approximation in B2 (full traversal lands in B3).
  const subgraph = await repo.getNeighbors(
    req.ctx!.orgId,
    pathParam(req, "id"),
    edgeTypes ? edgeTypes.split(",") : undefined,
    direction,
    limit,
  );
  res.json(subgraph);
});

router.get("/edges/:id", requireAuth, requirePermission("documents:read"), async (req, res) => {
  const edge = await repo.getEdge(req.ctx!.orgId, pathParam(req, "id"));
  if (!edge) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Edge not found" });
    return;
  }
  res.json(edge);
});

// Bounded path finding + entity history are wired in later phases; return the
// contract shape so the frontend can build against them now.
router.get("/paths", requireAuth, requirePermission("documents:read"), (_req, res) => {
  res.json({ paths: [], truncated: false });
});

router.get("/entities/:id/history", requireAuth, requirePermission("documents:read"), (_req, res) => {
  res.json({ versions: [] });
});

export default router;
