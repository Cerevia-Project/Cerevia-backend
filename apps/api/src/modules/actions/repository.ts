import { query } from "../../db/postgres.js";
import type { Cursor } from "../../lib/pagination.js";

export type ProposalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "executing"
  | "executed"
  | "failed"
  | "rejected";

export interface ProposalRow {
  id: string;
  org_id: string;
  kind: string;
  status: ProposalStatus;
  content: string | null;
  rationale: string | null;
  citations: unknown[];
  is_sample_data: boolean;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = "id, org_id, kind, status, content, rationale, citations, is_sample_data, created_at, updated_at";

export async function createProposal(
  orgId: string,
  id: string,
  kind: string,
  content: string,
  rationale: string,
): Promise<ProposalRow> {
  const result = await query<ProposalRow>(
    `INSERT INTO action_proposals (id, org_id, kind, status, content, rationale)
     VALUES ($1, $2, $3, 'draft', $4, $5)
     RETURNING ${COLUMNS}`,
    [id, orgId, kind, content, rationale],
  );
  return result.rows[0]!;
}

export async function listProposals(
  orgId: string,
  limit: number,
  cursor?: Cursor,
): Promise<{ rows: ProposalRow[]; nextCursor: Cursor | null }> {
  const params: unknown[] = [orgId];
  let where = "org_id = $1";
  if (cursor) {
    params.push(cursor.sortKey, cursor.id);
    where += ` AND (created_at, id) < ($${params.length - 1}, $${params.length})`;
  }
  params.push(limit + 1);
  const result = await query<ProposalRow>(
    `SELECT ${COLUMNS} FROM action_proposals WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const last = rows[rows.length - 1];
  return { rows, nextCursor: hasMore && last ? { sortKey: last.created_at.toISOString(), id: last.id } : null };
}

export async function getProposal(orgId: string, id: string): Promise<ProposalRow | null> {
  const result = await query<ProposalRow>(
    `SELECT ${COLUMNS} FROM action_proposals WHERE org_id = $1 AND id = $2`,
    [orgId, id],
  );
  return result.rows[0] ?? null;
}

export async function updateProposal(
  orgId: string,
  id: string,
  patch: { content?: string; rationale?: string; status?: ProposalStatus },
): Promise<ProposalRow | null> {
  const result = await query<ProposalRow>(
    `UPDATE action_proposals
     SET content = COALESCE($3, content),
         rationale = COALESCE($4, rationale),
         status = COALESCE($5, status),
         updated_at = now()
     WHERE org_id = $1 AND id = $2
     RETURNING ${COLUMNS}`,
    [orgId, id, patch.content ?? null, patch.rationale ?? null, patch.status ?? null],
  );
  return result.rows[0] ?? null;
}

export async function addApproval(
  orgId: string,
  id: string,
  proposalId: string,
  actorUserId: string,
  decision: "approved" | "rejected",
  reason: string | null,
): Promise<void> {
  await query(
    "INSERT INTO approvals (id, org_id, proposal_id, actor_user_id, decision, reason) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, orgId, proposalId, actorUserId, decision, reason],
  );
}
