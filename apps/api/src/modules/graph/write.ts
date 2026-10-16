import type { Graph } from "falkordb";
import { newId } from "../../lib/ids.js";
import { CHUNK_LABEL, DOCUMENT_LABEL, typeToLabel } from "./entities.js";

export interface GraphDocument {
  orgId: string;
  id: string;
  title: string;
  sourceId: string;
  isSampleData: boolean;
}

export interface GraphChunk {
  id: string;
  orgId: string;
  documentId: string;
  index: number;
  text: string;
  section: string | null;
  embedding: number[] | undefined;
}

export interface RelationshipInput {
  orgId: string;
  type: string; // from RELATIONSHIP_TYPES
  fromLabel: string; // node label (PascalCase)
  toLabel: string;
  fromId: string; // opaque entity id
  toId: string;
  confidence?: number;
}

const nowIso = () => new Date().toISOString();

export async function writeDocument(graph: Graph, doc: GraphDocument): Promise<void> {
  await graph.query(
    `MERGE (d:${DOCUMENT_LABEL} {orgId: $orgId, id: $id})
     SET d.label = $title, d.sourceId = $sourceId, d.isSampleData = $isSampleData, d.updatedAt = $updatedAt`,
    {
      params: {
        orgId: doc.orgId,
        id: doc.id,
        title: doc.title,
        sourceId: doc.sourceId,
        isSampleData: doc.isSampleData,
        updatedAt: nowIso(),
      },
    },
  );
}

export async function writeChunk(graph: Graph, chunk: GraphChunk): Promise<void> {
  await graph.query(
    `MERGE (c:${CHUNK_LABEL} {orgId: $orgId, id: $id})
     SET c.documentId = $documentId, c.index = $index, c.text = $text,
         c.section = $section, c.isSampleData = false, c.updatedAt = $updatedAt`,
    {
      params: {
        orgId: chunk.orgId,
        id: chunk.id,
        documentId: chunk.documentId,
        index: chunk.index,
        text: chunk.text,
        section: chunk.section ?? null,
        updatedAt: nowIso(),
      },
    },
  );

  if (chunk.embedding) {
    await graph.query(
      `MATCH (c:${CHUNK_LABEL} {orgId: $orgId, id: $id}) SET c.embedding = vecf32($embedding)`,
      { params: { orgId: chunk.orgId, id: chunk.id, embedding: chunk.embedding } },
    );
  }
}

export async function linkDocumentToChunk(
  graph: Graph,
  orgId: string,
  documentId: string,
  chunkId: string,
): Promise<void> {
  await graph.query(
    `MATCH (d:${DOCUMENT_LABEL} {orgId: $orgId, id: $documentId}),
           (c:${CHUNK_LABEL} {orgId: $orgId, id: $chunkId})
     MERGE (d)-[r:HAS_CHUNK]->(c)
     SET r.id = $edgeId, r.orgId = $orgId, r.fromId = $documentId, r.toId = $chunkId, r.current = true`,
    { params: { orgId, documentId, chunkId, edgeId: newId("edg") } },
  );
}

export async function writeRelationship(graph: Graph, rel: RelationshipInput): Promise<void> {
  await graph.query(
    `MATCH (a:${rel.fromLabel} {orgId: $orgId, id: $fromId}),
           (b:${rel.toLabel} {orgId: $orgId, id: $toId})
     MERGE (a)-[r:${rel.type}]->(b)
     SET r.id = $edgeId, r.orgId = $orgId, r.fromId = $fromId, r.toId = $toId,
         r.current = true, r.confidence = $confidence, r.validFrom = $validFrom`,
    {
      params: {
        orgId: rel.orgId,
        fromId: rel.fromId,
        toId: rel.toId,
        edgeId: newId("edg"),
        confidence: rel.confidence ?? 1,
        validFrom: nowIso(),
      },
    },
  );
}

export interface EntityInput {
  orgId: string;
  type: string; // entity type (lowercase) or a PascalCase label
  id: string;
  name: string;
  fields?: Record<string, string | number | boolean | null>;
  passage?: string | null;
  isSampleData?: boolean;
}

/** Idempotently write an entity node with arbitrary top-level fields. */
export async function writeEntity(graph: Graph, entity: EntityInput): Promise<void> {
  const label = typeToLabel[entity.type as keyof typeof typeToLabel] ?? entity.type;
  const entries = Object.entries(entity.fields ?? {});
  const setClauses = entries.map(([key], i) => `n.${key} = $f${i}`).join(", ");

  const params: Record<string, string | number | boolean | null> = {
    orgId: entity.orgId,
    id: entity.id,
    name: entity.name,
    passage: entity.passage ?? null,
    isSampleData: entity.isSampleData ?? false,
    updatedAt: nowIso(),
  };
  entries.forEach(([, value], i) => {
    params[`f${i}`] = value;
  });

  await graph.query(
    `MERGE (n:${label} {orgId: $orgId, id: $id})
     SET n.label = $name, n.passage = $passage, n.isSampleData = $isSampleData, n.updatedAt = $updatedAt${
       setClauses ? `, ${setClauses}` : ""
     }`,
    { params },
  );
}
