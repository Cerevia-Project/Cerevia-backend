import { createHash } from "node:crypto";
import { getObject, putObject } from "../../lib/storage.js";
import { embedTexts } from "../extraction/embed.js";
import { extractEntities } from "../extraction/extract.js";
import { getTenantGraph } from "../graph/client.js";
import { typeToLabel } from "../graph/entities.js";
import { migrateGraphSchema } from "../graph/schema.js";
import { linkDocumentToChunk, writeChunk, writeDocument, writeRelationship } from "../graph/write.js";
import { chunkText } from "./chunk.js";
import { extractTextFromBuffer } from "./extract.js";
import * as repo from "./repository.js";

function entityNodeId(type: string, name: string): string {
  const hash = createHash("sha256").update(`${type}:${name.trim().toLowerCase()}`).digest("hex").slice(0, 16);
  return `${type}_${hash}`;
}

export async function processIngestionJob(jobId: string, orgId: string): Promise<void> {
  const job = await repo.getJob(orgId, jobId);
  if (!job) return;

  if (!job.document_id) {
    await repo.updateJob(orgId, jobId, { status: "failed", error: "No document attached to job" });
    return;
  }

  try {
    await repo.updateJob(orgId, jobId, { status: "running", stage: "extracting_text", progress: 0.1 });

    const doc = await repo.getDocumentSource(orgId, job.document_id);
    if (!doc) throw new Error("Document source not found");

    const buffer = await getObject(doc.object_key);
    const extension = doc.title.split(".").pop()?.toLowerCase() ?? "";
    const text = await extractTextFromBuffer(buffer, extension, doc.mime_type);

    await repo.updateJob(orgId, jobId, { stage: "chunking", progress: 0.3 });
    const chunks = chunkText(text);

    await putObject(`${doc.object_key}.extracted.txt`, Buffer.from(text, "utf8"), "text/plain; charset=utf-8");

    // ── Graph write ────────────────────────────────────────────────
    const graph = await getTenantGraph(orgId);
    await migrateGraphSchema(graph);
    await writeDocument(graph, {
      orgId,
      id: job.document_id,
      title: doc.title,
      sourceId: job.source_id,
      isSampleData: job.is_sample_data,
    });

    await repo.updateJob(orgId, jobId, { stage: "embedding", progress: 0.5 });
    const embeddings = await embedTexts(chunks.map((c) => c.text));

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      await writeChunk(graph, {
        id: chunk.id,
        orgId,
        documentId: job.document_id,
        index: i,
        text: chunk.text,
        section: chunk.section,
        embedding: embeddings[i],
      });
      await linkDocumentToChunk(graph, orgId, job.document_id, chunk.id);
    }

    await repo.updateJob(orgId, jobId, { stage: "extracting_entities", progress: 0.8 });
    const extraction = await extractEntities(text);

    const nameToEntity = new Map<string, { id: string; type: string; label: string }>();
    for (const entity of extraction.entities) {
      const label = typeToLabel[entity.type as keyof typeof typeToLabel] ?? entity.type;
      const id = entityNodeId(entity.type, entity.name);
      nameToEntity.set(entity.name.trim().toLowerCase(), { id, type: entity.type, label });

      await graph.query(
        `MERGE (n:${label} {orgId: $orgId, id: $id})
         SET n.label = $name, n.props = $props, n.passage = $passage, n.updatedAt = $updatedAt`,
        {
          params: {
            orgId,
            id,
            name: entity.name,
            props: JSON.stringify(entity.properties ?? {}),
            passage: entity.passage,
            updatedAt: new Date().toISOString(),
          },
        },
      );

      // Provenance: link the entity to the chunk that contains its passage.
      const chunk = chunks.find((c) => c.text.includes(entity.passage));
      if (chunk) {
        await writeRelationship(graph, {
          orgId,
          type: "SUPPORTED_BY",
          fromLabel: label,
          toLabel: "Chunk",
          fromId: id,
          toId: chunk.id,
          confidence: 0.9,
        });
      }
    }

    for (const rel of extraction.relationships) {
      const from = nameToEntity.get(rel.from.trim().toLowerCase());
      const to = nameToEntity.get(rel.to.trim().toLowerCase());
      if (!from || !to) continue;
      await writeRelationship(graph, {
        orgId,
        type: rel.type,
        fromLabel: from.label,
        toLabel: to.label,
        fromId: from.id,
        toId: to.id,
        confidence: 0.85,
      });
    }

    await repo.updateJob(orgId, jobId, { status: "done", stage: "done", progress: 1 });
    await repo.addJobEvent(orgId, jobId, "done", `${chunks.length} chunks, ${extraction.entities.length} entities`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repo.updateJob(orgId, jobId, { status: "failed", stage: "failed", error: message });
    await repo.addJobEvent(orgId, jobId, "failed", message);
  }
}
