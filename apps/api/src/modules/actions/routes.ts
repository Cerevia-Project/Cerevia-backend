import { Router } from "express";
import { z } from "zod";
import { decodeCursor, encodeCursor } from "../../lib/pagination.js";
import { pathParam } from "../../lib/params.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import * as service from "./service.js";

const router = Router();

const PROPOSAL_KINDS = [
  "status_report",
  "meeting_summary",
  "follow_up_tasks",
  "handover_doc",
  "support_reply",
  "action_plan",
  "launch_readiness_report",
] as const;

router.post("/", requireAuth, requirePermission("proposals:create"), async (req, res) => {
  const { kind } = validate(z.object({ kind: z.enum(PROPOSAL_KINDS) }), req.body);
  const proposal = await service.createProposal(req.ctx!, kind);
  res.status(202).json({ proposalId: proposal.id });
});

router.get("/", requireAuth, async (req, res) => {
  const { limit, cursor } = validate(
    z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().optional() }),
    req.query,
  );
  const decoded = cursor ? decodeCursor(cursor) : undefined;
  const { rows, nextCursor } = await service.listProposals(req.ctx!, limit, decoded);
  res.json({ items: rows, nextCursor: nextCursor ? encodeCursor(nextCursor) : null });
});

router.get("/:id", requireAuth, async (req, res) => {
  res.json(await service.getProposal(req.ctx!, pathParam(req, "id")));
});

router.patch("/:id", requireAuth, requirePermission("proposals:create"), async (req, res) => {
  const { content } = validate(z.object({ content: z.string().min(1) }), req.body);
  res.json(await service.editProposal(req.ctx!, pathParam(req, "id"), content));
});

router.post("/:id/approve", requireAuth, requirePermission("actions:approve"), async (req, res) => {
  res.json(await service.approveProposal(req.ctx!, pathParam(req, "id")));
});

router.post("/:id/reject", requireAuth, requirePermission("actions:approve"), async (req, res) => {
  const { reason } = validate(z.object({ reason: z.string().min(1) }), req.body);
  res.json(await service.rejectProposal(req.ctx!, pathParam(req, "id"), reason));
});

export default router;
