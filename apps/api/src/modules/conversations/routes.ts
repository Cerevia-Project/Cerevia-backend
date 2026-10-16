import { Router, type Response } from "express";
import { z } from "zod";
import { decodeCursor, encodeCursor } from "../../lib/pagination.js";
import { pathParam } from "../../lib/params.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import * as repo from "./repository.js";
import { askQuestion, createConversation } from "./service.js";

const router = Router();
export const messagesRouter = Router();

function toConversation(row: { id: string; title: string; scope_project_id: string | null; is_sample_data: boolean; created_at: Date }) {
  return {
    id: row.id,
    title: row.title,
    scope: row.scope_project_id ? { projectId: row.scope_project_id } : undefined,
    createdAt: row.created_at.toISOString(),
    isSampleData: row.is_sample_data,
  };
}

function toMessage(row: { id: string; role: string; text: string; answer_status: string | null; access_limited: boolean; created_at: Date }) {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    answerStatus: row.answer_status ?? undefined,
    accessLimited: row.access_limited,
    createdAt: row.created_at.toISOString(),
  };
}

function startStream(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  return (event: Record<string, unknown>) => res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function* chunkString(text: string, size: number): Generator<string> {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}

router.post("/", requireAuth, async (req, res) => {
  const { title, scope } = validate(
    z.object({
      title: z.string().optional(),
      scope: z.object({ projectId: z.string().optional() }).optional(),
    }),
    req.body ?? {},
  );
  const conversation = await createConversation(req.ctx!, title, scope?.projectId);
  res.status(201).json(toConversation(conversation));
});

router.get("/", requireAuth, async (req, res) => {
  const { limit, cursor } = validate(
    z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().optional() }),
    req.query,
  );
  const decoded = cursor ? decodeCursor(cursor) : undefined;
  const { rows, nextCursor } = await repo.listConversations(req.ctx!.orgId, req.ctx!.userId, limit, decoded);
  res.json({ items: rows.map(toConversation), nextCursor: nextCursor ? encodeCursor(nextCursor) : null });
});

router.get("/:id", requireAuth, async (req, res) => {
  const id = pathParam(req, "id");
  const conversation = await repo.getConversation(req.ctx!.orgId, id);
  if (!conversation) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Conversation not found" });
    return;
  }
  const messages = await repo.listMessages(req.ctx!.orgId, id);
  res.json({ ...toConversation(conversation), messages: messages.map(toMessage) });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const existed = await repo.deleteConversation(req.ctx!.orgId, pathParam(req, "id"));
  if (!existed) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Conversation not found" });
    return;
  }
  res.status(204).end();
});

router.post("/:id/messages", requireAuth, async (req, res) => {
  const conversationId = pathParam(req, "id");
  const { text } = validate(z.object({ text: z.string().min(1) }), req.body);
  const { messageId } = await askQuestion(req.ctx!, conversationId, text);
  res.status(202).json({
    messageId,
    streamUrl: `/api/v1/conversations/${conversationId}/messages/${messageId}/stream`,
  });
});

router.get("/:id/messages/:messageId/stream", requireAuth, async (req, res) => {
  const messageId = pathParam(req, "messageId");
  const message = await repo.getMessage(req.ctx!.orgId, messageId);
  if (!message) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Message not found" });
    return;
  }

  const send = startStream(res);
  const evidence = await repo.getEvidence(req.ctx!.orgId, messageId);

  send({ type: "status", stage: "writing" });
  for (const chunk of chunkString(message.text, 48)) {
    send({ type: "text_delta", text: chunk });
  }
  for (const claim of evidence.claims) {
    send({ type: "claim", claim });
  }
  for (const citation of evidence.citations) {
    send({ type: "citation", citation });
  }
  send({
    type: "done",
    messageId,
    answerStatus: message.answer_status ?? "answered",
    accessLimited: message.access_limited,
  });
  res.end();
});

router.get("/:id/messages/:messageId", requireAuth, async (req, res) => {
  const message = await repo.getMessage(req.ctx!.orgId, pathParam(req, "messageId"));
  if (!message) {
    res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Message not found" });
    return;
  }
  res.json(toMessage(message));
});

messagesRouter.get("/:messageId/evidence", requireAuth, async (req, res) => {
  const messageId = pathParam(req, "messageId");
  const evidence = await repo.getEvidence(req.ctx!.orgId, messageId);
  res.json({
    claims: evidence.claims,
    citations: evidence.citations,
    paths: evidence.paths,
    retrievalSummary: { toolsUsed: 0, filteredCount: 0 },
  });
});

messagesRouter.post("/:messageId/feedback", requireAuth, async (req, res) => {
  const messageId = pathParam(req, "messageId");
  const { rating, reason } = validate(
    z.object({ rating: z.enum(["up", "down"]), reason: z.string().optional() }),
    req.body,
  );
  await repo.addEvidence(req.ctx!.orgId, messageId, "feedback", { rating, reason: reason ?? null });
  res.status(204).end();
});

export default router;
