import { Router } from "express";
import { z } from "zod";
import { getObject } from "../../lib/storage.js";
import { decodeCursor, encodeCursor } from "../../lib/pagination.js";
import { pathParam } from "../../lib/params.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import * as repo from "./repository.js";

const router = Router();

function toDocument(row: { id: string; source_id: string; title: string; status: string; is_sample_data: boolean; versions?: unknown[] }) {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    status: row.status,
    isSampleData: row.is_sample_data,
    versions: row.versions ?? [],
  };
}

router.get("/", requireAuth, requirePermission("documents:read"), async (req, res) => {
  const { limit, cursor } = validate(
    z.object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      cursor: z.string().optional(),
    }),
    req.query,
  );
  const decoded = cursor ? decodeCursor(cursor) : undefined;
  const { rows, nextCursor } = await repo.listDocuments(req.ctx!.orgId, limit, decoded);
  res.json({
    items: rows.map((r) => toDocument({ ...r, versions: [] })),
    nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
  });
});

router.get("/:id", requireAuth, requirePermission("documents:read"), async (req, res) => {
  const doc = await repo.getDocument(req.ctx!.orgId, pathParam(req, "id"));
  if (!doc) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Document not found" });
    return;
  }
  res.json(toDocument(doc));
});

router.get("/:id/content", requireAuth, requirePermission("documents:read"), async (req, res) => {
  const id = pathParam(req, "id");
  const version = await repo.getLatestVersionKey(req.ctx!.orgId, id);
  if (!version) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Document not found" });
    return;
  }

  // Prefer the extracted text (written by the ingestion pipeline); fall back to
  // the raw object for plain-text uploads that failed before extraction.
  let content: Buffer;
  try {
    content = await getObject(`${version.object_key}.extracted.txt`);
  } catch {
    content = await getObject(version.object_key);
  }

  res.json({ documentId: id, chunkId: null, content: content.toString("utf8") });
});

export default router;
