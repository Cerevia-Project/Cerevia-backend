import { query } from "../../db/postgres.js";
import { embedTexts } from "../extraction/embed.js";
import { getTenantGraph } from "../graph/client.js";

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  text: string;
  score: number;
}

interface ChunkNode {
  properties: {
    id: string;
    documentId: string;
    text: string;
  };
}

/**
 * Hybrid retrieval over FalkorDB: vector similarity (cosine) + full-text, merged
 * and re-ranked. Source-ACL filtering happens inside the query via orgId (one
 * graph per org is the primary isolation; the predicate is defense in depth).
 */
export async function hybridSearch(
  orgId: string,
  queryText: string,
  limit = 5,
): Promise<RetrievalHit[]> {
  const graph = await getTenantGraph(orgId);
  const byChunk = new Map<string, RetrievalHit>();

  let embedding: number[] | undefined;
  try {
    [embedding] = await embedTexts([queryText]);
  } catch (error) {
    console.error("hybridSearch: embedding failed, falling back to keyword search:", (error as Error).message);
  }
  if (embedding) {
    const vec = await graph.query<{ node: ChunkNode; score: number }>(
      `CALL db.idx.vector.queryNodes('Chunk', 'embedding', $k, vecf32($q))
       YIELD node, score
       WHERE node.orgId = $orgId
       RETURN node, score`,
      { params: { k: limit, q: embedding, orgId } },
    );
    for (const row of vec.data ?? []) {
      const node = row.node.properties;
      // score is a distance for cosine; smaller is more similar.
      byChunk.set(node.id, {
        chunkId: node.id,
        documentId: node.documentId,
        documentTitle: "",
        text: node.text,
        score: 1 - Number(row.score),
      });
    }
  }

  const fulltext = await graph.query<{ node: ChunkNode; score: number }>(
    `CALL db.idx.fulltext.queryNodes('Chunk', $q)
     YIELD node, score
     WHERE node.orgId = $orgId
     RETURN node, score`,
    { params: { q: queryText, orgId } },
  );
  for (const row of fulltext.data ?? []) {
    const node = row.node.properties;
    const existing = byChunk.get(node.id);
    if (existing) {
      existing.score += Number(row.score);
    } else {
      byChunk.set(node.id, {
        chunkId: node.id,
        documentId: node.documentId,
        documentTitle: "",
        text: node.text,
        score: Number(row.score),
      });
    }
  }

  const hits = [...byChunk.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  return attachDocumentTitles(orgId, hits);
}

async function attachDocumentTitles(orgId: string, hits: RetrievalHit[]): Promise<RetrievalHit[]> {
  const ids = [...new Set(hits.map((h) => h.documentId))];
  if (ids.length === 0) return hits;

  const result = await query<{ id: string; title: string }>(
    "SELECT id, title FROM documents WHERE org_id = $1 AND id = ANY($2::text[])",
    [orgId, ids],
  );
  const titles = new Map(result.rows.map((r) => [r.id, r.title]));
  return hits.map((h) => ({ ...h, documentTitle: titles.get(h.documentId) ?? "" }));
}
