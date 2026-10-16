import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { withTransaction } from "../../db/postgres.js";
import { auditLog } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import type { Cursor } from "../../lib/pagination.js";
import { putObject } from "../../lib/storage.js";
import type { TenantContext } from "../../lib/tenant.js";
import { getQueue } from "../../queue/queue.js";
import { createJobInTx } from "../ingestion/repository.js";
import * as repo from "./repository.js";

const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "csv", "json"]);
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export async function listSources(ctx: TenantContext, limit: number, cursor?: Cursor) {
  return repo.listSources(ctx.orgId, limit, cursor);
}

export async function createSource(ctx: TenantContext, name: string, type: "upload" | "connector") {
  const source = await repo.createSource(ctx.orgId, newId("src"), name, type, false);
  await auditLog({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "sources.create",
    resourceType: "source",
    resourceId: source.id,
  });
  return source;
}

export async function updateSource(ctx: TenantContext, id: string, name: string) {
  const source = await repo.updateSourceName(ctx.orgId, id, name);
  if (!source) throw new AppError("NOT_FOUND", "Source not found");
  await auditLog({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "sources.update",
    resourceType: "source",
    resourceId: id,
  });
  return source;
}

export async function deleteSource(ctx: TenantContext, id: string) {
  const existed = await repo.deleteSource(ctx.orgId, id);
  if (!existed) throw new AppError("NOT_FOUND", "Source not found");
  await auditLog({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "sources.delete",
    resourceType: "source",
    resourceId: id,
  });
}

export async function upload(ctx: TenantContext, sourceId: string, file: UploadFile) {
  const source = await repo.getSource(ctx.orgId, sourceId);
  if (!source) throw new AppError("NOT_FOUND", "Source not found");

  const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError("UNSUPPORTED_FILE_TYPE", `Unsupported file type: .${ext}`);
  }
  if (file.buffer.byteLength > MAX_FILE_SIZE) {
    throw new AppError("FILE_TOO_LARGE", "File exceeds the size limit");
  }

  const contentHash = createHash("sha256").update(file.buffer).digest("hex");
  const detected = await fileTypeFromBuffer(file.buffer);
  const mimeType = detected?.mime ?? file.mimetype ?? "application/octet-stream";
  const objectKey = `${ctx.orgId}/${sourceId}/${contentHash}`;

  await putObject(objectKey, file.buffer, mimeType);

  const documentId = newId("doc");
  const versionId = newId("dver");
  const jobId = newId("job");

  await withTransaction(async (client) => {
    await repo.createDocumentWithVersion(
      client,
      { orgId: ctx.orgId, id: documentId, sourceId, title: file.originalname, isSampleData: false },
      {
        orgId: ctx.orgId,
        id: versionId,
        documentId,
        version: 1,
        contentHash,
        objectKey,
        mimeType,
        byteSize: file.buffer.byteLength,
      },
    );
    await createJobInTx(client, {
      id: jobId,
      orgId: ctx.orgId,
      sourceId,
      documentId,
      isSampleData: false,
    });
  });

  await getQueue().add("process", { jobId, orgId: ctx.orgId });

  await auditLog({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "sources.upload",
    resourceType: "document",
    resourceId: documentId,
    metadata: { sourceId, contentHash, byteSize: file.buffer.byteLength },
  });

  return { jobId };
}
