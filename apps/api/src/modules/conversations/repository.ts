import { query } from "../../db/postgres.js";
import { newId } from "../../lib/ids.js";
import type { Cursor } from "../../lib/pagination.js";

export interface ConversationRow {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  scope_project_id: string | null;
  is_sample_data: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MessageRow {
  id: string;
  org_id: string;
  conversation_id: string;
  role: "user" | "assistant";
  text: string;
  answer_status: string | null;
  access_limited: boolean;
  created_at: Date;
}

export async function createConversation(
  orgId: string,
  userId: string,
  id: string,
  title: string,
  scopeProjectId: string | null,
): Promise<ConversationRow> {
  const result = await query<ConversationRow>(
    `INSERT INTO conversations (id, org_id, user_id, title, scope_project_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, org_id, user_id, title, scope_project_id, is_sample_data, created_at, updated_at`,
    [id, orgId, userId, title, scopeProjectId],
  );
  return result.rows[0]!;
}

export async function listConversations(
  orgId: string,
  userId: string,
  limit: number,
  cursor?: Cursor,
): Promise<{ rows: ConversationRow[]; nextCursor: Cursor | null }> {
  const params: unknown[] = [orgId, userId];
  let where = "org_id = $1 AND user_id = $2";
  if (cursor) {
    params.push(cursor.sortKey, cursor.id);
    where += ` AND (created_at, id) < ($${params.length - 1}, $${params.length})`;
  }
  params.push(limit + 1);

  const result = await query<ConversationRow>(
    `SELECT id, org_id, user_id, title, scope_project_id, is_sample_data, created_at, updated_at
     FROM conversations WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const last = rows[rows.length - 1];
  return { rows, nextCursor: hasMore && last ? { sortKey: last.created_at.toISOString(), id: last.id } : null };
}

export async function getConversation(orgId: string, id: string): Promise<ConversationRow | null> {
  const result = await query<ConversationRow>(
    "SELECT id, org_id, user_id, title, scope_project_id, is_sample_data, created_at, updated_at FROM conversations WHERE org_id = $1 AND id = $2",
    [orgId, id],
  );
  return result.rows[0] ?? null;
}

export async function listMessages(orgId: string, conversationId: string): Promise<MessageRow[]> {
  const result = await query<MessageRow>(
    `SELECT id, org_id, conversation_id, role, text, answer_status, access_limited, created_at
     FROM messages WHERE org_id = $1 AND conversation_id = $2 ORDER BY created_at ASC, id ASC`,
    [orgId, conversationId],
  );
  return result.rows;
}

export async function deleteConversation(orgId: string, id: string): Promise<boolean> {
  const result = await query("DELETE FROM conversations WHERE org_id = $1 AND id = $2", [orgId, id]);
  return (result.rowCount ?? 0) > 0;
}

export async function createMessage(
  orgId: string,
  conversationId: string,
  id: string,
  role: "user" | "assistant",
  text: string,
  answerStatus?: string,
): Promise<MessageRow> {
  const result = await query<MessageRow>(
    `INSERT INTO messages (id, org_id, conversation_id, role, text, answer_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, org_id, conversation_id, role, text, answer_status, access_limited, created_at`,
    [id, orgId, conversationId, role, text, answerStatus ?? null],
  );
  return result.rows[0]!;
}

export async function getMessage(orgId: string, id: string): Promise<MessageRow | null> {
  const result = await query<MessageRow>(
    "SELECT id, org_id, conversation_id, role, text, answer_status, access_limited, created_at FROM messages WHERE org_id = $1 AND id = $2",
    [orgId, id],
  );
  return result.rows[0] ?? null;
}

export async function addEvidence(
  orgId: string,
  messageId: string,
  kind: string,
  payload: unknown,
): Promise<void> {
  await query(
    "INSERT INTO message_evidence (id, org_id, message_id, kind, payload) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [newId("ev"), orgId, messageId, kind, JSON.stringify(payload)],
  );
}

export async function getEvidence(
  orgId: string,
  messageId: string,
): Promise<{ claims: unknown[]; citations: unknown[]; paths: unknown[]; subgraph: unknown[]; conflicts: unknown[] }> {
  const result = await query<{ kind: string; payload: unknown }>(
    "SELECT kind, payload FROM message_evidence WHERE org_id = $1 AND message_id = $2 ORDER BY created_at ASC",
    [orgId, messageId],
  );
  const out = { claims: [] as unknown[], citations: [] as unknown[], paths: [] as unknown[], subgraph: [] as unknown[], conflicts: [] as unknown[] };
  for (const row of result.rows) {
    if (row.kind === "claim") out.claims.push(row.payload);
    else if (row.kind === "citation") out.citations.push(row.payload);
    else if (row.kind === "path") out.paths.push(row.payload);
    else if (row.kind === "subgraph") out.subgraph.push(row.payload);
    else if (row.kind === "conflict") out.conflicts.push(row.payload);
  }
  return out;
}
