import { AppError } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import type { TenantContext } from "../../lib/tenant.js";
import { runAgent } from "../agent/orchestrator.js";
import * as repo from "./repository.js";

export async function createConversation(
  ctx: TenantContext,
  title: string | undefined,
  scopeProjectId: string | undefined,
) {
  return repo.createConversation(ctx.orgId, ctx.userId, newId("cnv"), title || "New conversation", scopeProjectId ?? null);
}

export async function askQuestion(ctx: TenantContext, conversationId: string, text: string) {
  const conversation = await repo.getConversation(ctx.orgId, conversationId);
  if (!conversation) {
    throw new AppError("NOT_FOUND", "Conversation not found");
  }

  await repo.createMessage(ctx.orgId, conversationId, newId("msg"), "user", text);

  const answer = await runAgent(ctx, text);
  const assistantMessage = await repo.createMessage(
    ctx.orgId,
    conversationId,
    newId("msg"),
    "assistant",
    answer.text,
    answer.answerStatus,
  );

  for (const claim of answer.claims) {
    await repo.addEvidence(ctx.orgId, assistantMessage.id, "claim", claim);
  }
  for (const citation of answer.citations) {
    await repo.addEvidence(ctx.orgId, assistantMessage.id, "citation", citation);
  }

  return { messageId: assistantMessage.id, answer };
}
