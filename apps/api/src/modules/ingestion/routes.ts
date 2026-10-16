import { Router } from "express";
import { z } from "zod";
import { decodeCursor, encodeCursor } from "../../lib/pagination.js";
import { pathParam } from "../../lib/params.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { getQueue } from "../../queue/queue.js";
import * as repo from "./repository.js";

const router = Router();

function toJob(row: {
  id: string;
  source_id: string;
  document_id: string | null;
  status: string;
  stage: string;
  progress: number;
  error: string | null;
  is_sample_data: boolean;
  created_at: Date;
}) {
  return {
    id: row.id,
    sourceId: row.source_id,
    documentId: row.document_id,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    createdAt: row.created_at.toISOString(),
    error: row.error,
    isSampleData: row.is_sample_data,
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
  const { rows, nextCursor } = await repo.listJobs(req.ctx!.orgId, limit, decoded);
  res.json({
    items: rows.map(toJob),
    nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
  });
});

router.get("/:id", requireAuth, requirePermission("documents:read"), async (req, res) => {
  const job = await repo.getJob(req.ctx!.orgId, pathParam(req, "id"));
  if (!job) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Job not found" });
    return;
  }
  res.json(toJob(job));
});

router.post("/:id/retry", requireAuth, requirePermission("sources:upload"), async (req, res) => {
  const job = await repo.getJob(req.ctx!.orgId, pathParam(req, "id"));
  if (!job) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Job not found" });
    return;
  }
  await repo.updateJob(req.ctx!.orgId, job.id, { status: "queued", stage: "queued", error: null });
  await getQueue().add("process", { jobId: job.id, orgId: req.ctx!.orgId });
  res.status(202).json({ jobId: job.id });
});

export default router;
