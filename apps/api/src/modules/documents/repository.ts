import { query } from "../../db/postgres.js";
import type { Cursor } from "../../lib/pagination.js";

export interface DocumentRow {
  id: string;
  source_id: string;
  title: string;
  status: "approved" | "draft" | "superseded" | "unknown";
  is_sample_data: boolean;
  created_at: Date;
}

export interface DocumentWithVersions extends DocumentRow {
  versions: { id: string; version: number; createdAt: string; contentHash: string }[];
}

export async function listDocuments(
  orgId: string,
  limit: number,
  cursor?: Cursor,
): Promise<{ rows: DocumentRow[]; nextCursor: Cursor | null }> {
  const params: unknown[] = [orgId];
  let where = "org_id = $1";
  if (cursor) {
    params.push(cursor.sortKey, cursor.id);
    where += ` AND (created_at, id) < ($${params.length - 1}, $${params.length})`;
  }
  params.push(limit + 1);

  const result = await query<DocumentRow>(
    `SELECT id, source_id, title, status, is_sample_data, created_at
     FROM documents WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: hasMore && last ? { sortKey: last.created_at.toISOString(), id: last.id } : null,
  };
}

export async function getDocument(orgId: string, id: string): Promise<DocumentWithVersions | null> {
  const result = await query<DocumentRow & { version_id: string | null; version: number | null; version_created_at: Date | null; content_hash: string | null }>(
    `SELECT d.id, d.source_id, d.title, d.status, d.is_sample_data, d.created_at,
            dv.id AS version_id, dv.version, dv.created_at AS version_created_at, dv.content_hash
     FROM documents d
     LEFT JOIN document_versions dv ON dv.document_id = d.id
     WHERE d.org_id = $1 AND d.id = $2
     ORDER BY dv.version DESC`,
    [orgId, id],
  );

  if (result.rows.length === 0) return null;

  const first = result.rows[0]!;
  const versions = result.rows
    .filter((r) => r.version_id !== null)
    .map((r) => ({
      id: r.version_id!,
      version: r.version!,
      createdAt: r.version_created_at!.toISOString(),
      contentHash: r.content_hash!,
    }));

  return {
    id: first.id,
    source_id: first.source_id,
    title: first.title,
    status: first.status,
    is_sample_data: first.is_sample_data,
    created_at: first.created_at,
    versions,
  };
}

export async function getLatestVersionKey(orgId: string, documentId: string): Promise<{ object_key: string; mime_type: string } | null> {
  const result = await query<{ object_key: string; mime_type: string }>(
    `SELECT dv.object_key, dv.mime_type
     FROM document_versions dv
     JOIN documents d ON d.id = dv.document_id
     WHERE d.org_id = $1 AND d.id = $2
     ORDER BY dv.version DESC
     LIMIT 1`,
    [orgId, documentId],
  );
  return result.rows[0] ?? null;
}
