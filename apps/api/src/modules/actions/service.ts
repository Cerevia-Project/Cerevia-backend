import { auditLog } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import type { TenantContext } from "../../lib/tenant.js";
import * as repo from "./repository.js";

const KIND_DRAFT: Record<string, string> = {
  status_report: "Status report (draft)",
  meeting_summary: "Meeting summary (draft)",
  follow_up_tasks: "Follow-up tasks (draft)",
  handover_doc: "Handover document (draft)",
  support_reply: "Support reply (draft)",
  action_plan: "Action plan (draft)",
  launch_readiness_report: "Launch readiness report (draft)",
};

function toProposal(row: {
  id: string;
  kind: string;
  status: string;
  content: string | null;
  rationale: string | null;
  citations: unknown[];
  is_sample_data: boolean;
}) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    content: row.content ?? "",
    rationale: row.rationale ?? "",
    citations: row.citations ?? [],
    isSampleData: row.is_sample_data,
  };
}

export async function createProposal(ctx: TenantContext, kind: string) {
  const proposal = await repo.createProposal(
    ctx.orgId,
    newId("prp"),
    kind,
    KIND_DRAFT[kind] ?? `${kind} (draft)`,
    "",
  );
  await auditLog({ orgId: ctx.orgId, actorUserId: ctx.userId, action: "proposals.create", resourceType: "proposal", resourceId: proposal.id, metadata: { kind } });
  return toProposal(proposal);
}

export async function listProposals(ctx: TenantContext, limit: number, cursor?: { sortKey: string; id: string }) {
  return repo.listProposals(ctx.orgId, limit, cursor);
}

export async function getProposal(ctx: TenantContext, id: string) {
  const proposal = await repo.getProposal(ctx.orgId, id);
  if (!proposal) throw new AppError("NOT_FOUND", "Proposal not found");
  return toProposal(proposal);
}

export async function editProposal(ctx: TenantContext, id: string, content: string) {
  const proposal = await repo.getProposal(ctx.orgId, id);
  if (!proposal) throw new AppError("NOT_FOUND", "Proposal not found");
  if (proposal.status !== "draft") {
    throw new AppError("CONFLICT", "Only draft proposals can be edited");
  }
  const updated = await repo.updateProposal(ctx.orgId, id, { content });
  return toProposal(updated!);
}

export async function approveProposal(ctx: TenantContext, id: string) {
  const proposal = await repo.getProposal(ctx.orgId, id);
  if (!proposal) throw new AppError("NOT_FOUND", "Proposal not found");
  if (proposal.status !== "draft" && proposal.status !== "pending_approval") {
    throw new AppError("CONFLICT", `Cannot approve a proposal in state "${proposal.status}"`);
  }

  const updated = await repo.updateProposal(ctx.orgId, id, { status: "approved" });
  await repo.addApproval(ctx.orgId, newId("apr"), id, ctx.userId, "approved", null);
  await auditLog({ orgId: ctx.orgId, actorUserId: ctx.userId, action: "proposals.approve", resourceType: "proposal", resourceId: id });
  return toProposal(updated!);
}

export async function rejectProposal(ctx: TenantContext, id: string, reason: string) {
  const proposal = await repo.getProposal(ctx.orgId, id);
  if (!proposal) throw new AppError("NOT_FOUND", "Proposal not found");
  if (proposal.status !== "draft" && proposal.status !== "pending_approval") {
    throw new AppError("CONFLICT", `Cannot reject a proposal in state "${proposal.status}"`);
  }

  const updated = await repo.updateProposal(ctx.orgId, id, { status: "rejected" });
  await repo.addApproval(ctx.orgId, newId("apr"), id, ctx.userId, "rejected", reason);
  await auditLog({ orgId: ctx.orgId, actorUserId: ctx.userId, action: "proposals.reject", resourceType: "proposal", resourceId: id, metadata: { reason } });
  return toProposal(updated!);
}
