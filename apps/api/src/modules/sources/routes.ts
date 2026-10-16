import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { decodeCursor, encodeCursor } from "../../lib/pagination.js";
import { pathParam } from "../../lib/params.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import * as service from "./service.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function toSource(row: { id: string; name: string; type: string; state: string; last_sync: Date | null; error_summary: string | null; is_sample_data: boolean }) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    state: row.state,
    lastSync: row.last_sync?.toISOString() ?? null,
    errorSummary: row.error_summary,
    isSampleData: row.is_sample_data,
  };
}

router.get("/", requireAuth, requirePermission("sources:read"), async (req, res) => {
  const { limit, cursor } = validate(
    z.object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      cursor: z.string().optional(),
    }),
    req.query,
  );
  const decoded = cursor ? decodeCursor(cursor) : undefined;
  const { rows, nextCursor } = await service.listSources(req.ctx!, limit, decoded);
  res.json({
    items: rows.map(toSource),
    nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
  });
});

router.post("/", requireAuth, requirePermission("sources:write"), async (req, res) => {
  const { name, type } = validate(
    z.object({ name: z.string().min(1), type: z.enum(["upload", "connector"]) }),
    req.body,
  );
  const source = await service.createSource(req.ctx!, name, type);
  res.status(201).json(toSource(source));
});

router.patch("/:id", requireAuth, requirePermission("sources:write"), async (req, res) => {
  const { name } = validate(z.object({ name: z.string().min(1) }), req.body);
  const source = await service.updateSource(req.ctx!, pathParam(req, "id"), name);
  res.json(toSource(source));
});

router.delete("/:id", requireAuth, requirePermission("sources:write"), async (req, res) => {
  await service.deleteSource(req.ctx!, pathParam(req, "id"));
  res.status(204).end();
});

router.post(
  "/:id/uploads",
  requireAuth,
  requirePermission("sources:upload"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ status: 400, code: "VALIDATION_FAILED", detail: "Missing file" });
      return;
    }
    const result = await service.upload(req.ctx!, pathParam(req, "id"), {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    });
    res.status(202).json({ jobId: result.jobId });
  },
);

export default router;
