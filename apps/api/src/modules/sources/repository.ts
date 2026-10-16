import { query, withTransaction, type PoolClient } from "../../db/postgres.js";
import type { Cursor } from "../../lib/pagination.js";

export interface SourceRow {
  id: string;
  name: string;
  type: "upload" | "connector";
  state: "connected" | "disconnected" | "error";
  last_sync: Date | null;
  error_summary: string | null;
  is_sample_data: boolean;
  created_at: Date;
}

const SOURCE_COLUMNS =
  "id, name, type, state, last_sync, error_summary, is_sample_data, created_at";

export async function listSources(
  orgId: string,
  limit: number,
  cursor?: Cursor,
): Promise<{ rows: SourceRow[]; nextCursor: Cursor | null }> {
  const params: unknown[] = [orgId];
  let where = "org_id = $1";
  if (cursor) {
    params.push(cursor.sortKey, cursor.id);
    where += ` AND (created_at, id) < ($${params.length - 1}, $${params.length})`;
  }
  params.push(limit + 1);

  const result = await query<SourceRow>(
    `SELECT ${SOURCE_COLUMNS} FROM sources WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? { sortKey: last.created_at.toISOString(), id: last.id } : null;
  return { rows, nextCursor };
}

export async function getSource(orgId: string, id: string): Promise<SourceRow | null> {
  const result = await query<SourceRow>(
    `SELECT ${SOURCE_COLUMNS} FROM sources WHERE org_id = $1 AND id = $2`,
    [orgId, id],
  );
  return result.rows[0] ?? null;
}

export async function createSource(
  orgId: string,
  id: string,
  name: string,
  type: "upload" | "connector",
  isSampleData: boolean,
): Promise<SourceRow> {
  const result = await query<SourceRow>(
    `INSERT INTO sources (id, org_id, name, type, state, is_sample_data)
     VALUES ($1, $2, $3, $4, 'disconnected', $5)
     RETURNING ${SOURCE_COLUMNS}`,
    [id, orgId, name, type, isSampleData],
  );
  return result.rows[0]!;
}

export async function updateSourceName(orgId: string, id: string, name: string): Promise<SourceRow | null> {
  const result = await query<SourceRow>(
    `UPDATE sources SET name = $3, updated_at = now() WHERE org_id = $1 AND id = $2 RETURNING ${SOURCE_COLUMNS}`,
    [orgId, id, name],
  );
  return result.rows[0] ?? null;
}

export async function deleteSource(orgId: string, id: string): Promise<boolean> {
  const result = await query("DELETE FROM sources WHERE org_id = $1 AND id = $2", [orgId, id]);
  return (result.rowCount ?? 0) > 0;
}

export interface CreateDocumentParams {
  orgId: string;
  id: string;
  sourceId: string;
  title: string;
  isSampleData: boolean;
}

export interface DocumentVersionParams {
  orgId: string;
  id: string;
  documentId: string;
  version: number;
  contentHash: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
}

export async function findExistingVersionByHash(
  orgId: string,
  sourceId: string,
  contentHash: string,
): Promise<{ document_id: string } | null> {
  const result = await query<{ document_id: string }>(
    `SELECT dv.document_id
     FROM document_versions dv
     JOIN documents d ON d.id = dv.document_id
     WHERE dv.org_id = $1 AND d.source_id = $2 AND dv.content_hash = $3
     LIMIT 1`,
    [orgId, sourceId, contentHash],
  );
  return result.rows[0] ?? null;
}

export function createDocumentWithVersion(
  client: PoolClient,
  doc: CreateDocumentParams,
  version: DocumentVersionParams,
): Promise<void> {
  return Promise.all([
    client.query(
      "INSERT INTO documents (id, org_id, source_id, title, is_sample_data) VALUES ($1, $2, $3, $4, $5)",
      [doc.id, doc.orgId, doc.sourceId, doc.title, doc.isSampleData],
    ),
    client.query(
      `INSERT INTO document_versions (id, org_id, document_id, version, content_hash, object_key, mime_type, byte_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [version.id, version.orgId, version.documentId, version.version, version.contentHash, version.objectKey, version.mimeType, version.byteSize],
    ),
  ]).then(() => undefined);
}
