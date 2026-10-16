import { query, type PoolClient } from "../../db/postgres.js";
import { newId } from "../../lib/ids.js";
import type { Cursor } from "../../lib/pagination.js";

export type IngestionStatus = "queued" | "running" | "done" | "failed";

export interface IngestionJobRow {
  id: string;
  org_id: string;
  source_id: string;
  document_id: string | null;
  status: IngestionStatus;
  stage: string;
  progress: number;
  error: string | null;
  is_sample_data: boolean;
  created_at: Date;
  updated_at: Date;
}

const JOB_COLUMNS =
  "id, org_id, source_id, document_id, status, stage, progress, error, is_sample_data, created_at, updated_at";

export interface CreateJobParams {
  id: string;
  orgId: string;
  sourceId: string;
  documentId: string;
  isSampleData: boolean;
}

export async function createJobInTx(client: PoolClient, params: CreateJobParams): Promise<IngestionJobRow> {
  const result = await client.query<IngestionJobRow>(
    `INSERT INTO ingestion_jobs (id, org_id, source_id, document_id, status, stage, is_sample_data)
     VALUES ($1, $2, $3, $4, 'queued', 'queued', $5)
     RETURNING ${JOB_COLUMNS}`,
    [params.id, params.orgId, params.sourceId, params.documentId, params.isSampleData],
  );
  return result.rows[0]!;
}

export async function getJob(orgId: string, id: string): Promise<IngestionJobRow | null> {
  const result = await query<IngestionJobRow>(
    `SELECT ${JOB_COLUMNS} FROM ingestion_jobs WHERE org_id = $1 AND id = $2`,
    [orgId, id],
  );
  return result.rows[0] ?? null;
}

export async function listJobs(
  orgId: string,
  limit: number,
  cursor?: Cursor,
): Promise<{ rows: IngestionJobRow[]; nextCursor: Cursor | null }> {
  const params: unknown[] = [orgId];
  let where = "org_id = $1";
  if (cursor) {
    params.push(cursor.sortKey, cursor.id);
    where += ` AND (created_at, id) < ($${params.length - 1}, $${params.length})`;
  }
  params.push(limit + 1);

  const result = await query<IngestionJobRow>(
    `SELECT ${JOB_COLUMNS} FROM ingestion_jobs WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
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

export async function updateJob(
  orgId: string,
  id: string,
  patch: { status?: IngestionStatus; stage?: string; progress?: number; error?: string | null },
): Promise<void> {
  await query(
    `UPDATE ingestion_jobs
     SET status = COALESCE($3, status),
         stage = COALESCE($4, stage),
         progress = COALESCE($5, progress),
         error = $6,
         updated_at = now()
     WHERE org_id = $1 AND id = $2`,
    [orgId, id, patch.status ?? null, patch.stage ?? null, patch.progress ?? null, patch.error ?? null],
  );
}

export async function addJobEvent(
  orgId: string,
  jobId: string,
  stage: string,
  detail?: string,
): Promise<void> {
  await query(
    "INSERT INTO ingestion_job_events (id, org_id, job_id, stage, detail) VALUES ($1, $2, $3, $4, $5)",
    [newId("evt"), orgId, jobId, stage, detail ?? null],
  );
}

export interface DocumentSource {
  title: string;
  object_key: string;
  mime_type: string;
  byte_size: number;
}

export async function getDocumentSource(orgId: string, documentId: string): Promise<DocumentSource | null> {
  const result = await query<DocumentSource>(
    `SELECT d.title, dv.object_key, dv.mime_type, dv.byte_size
     FROM documents d
     JOIN document_versions dv ON dv.document_id = d.id
     WHERE d.org_id = $1 AND d.id = $2
     ORDER BY dv.version DESC
     LIMIT 1`,
    [orgId, documentId],
  );
  return result.rows[0] ?? null;
}
