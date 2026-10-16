import { ConstraintType, EntityType as FalkorEntityType, type Graph } from "falkordb";
import { env } from "../../config/env.js";
import { CHUNK_LABEL, NODE_LABELS } from "./entities.js";

function ignoreIfAlreadyExists(error: unknown): void {
  const message = String(error);
  if (!/already|exists/i.test(message)) throw error;
}

/**
 * Idempotently create the tenant graph's indexes and constraints. Constraints
 * build asynchronously; MERGE writes are safe during the build (see ADR 0001).
 */
export async function migrateGraphSchema(graph: Graph): Promise<void> {
  for (const label of NODE_LABELS) {
    try {
      await graph.createNodeRangeIndex(label, "orgId", "id");
    } catch (error) {
      ignoreIfAlreadyExists(error);
    }
    try {
      await graph.constraintCreate(ConstraintType.UNIQUE, FalkorEntityType.NODE, label, "orgId", "id");
    } catch (error) {
      ignoreIfAlreadyExists(error);
    }
  }

  try {
    await graph.createNodeFulltextIndex(CHUNK_LABEL, "text");
  } catch (error) {
    ignoreIfAlreadyExists(error);
  }

  try {
    await graph.createNodeVectorIndex(CHUNK_LABEL, env.voyage.dimension, "cosine", "embedding");
  } catch (error) {
    ignoreIfAlreadyExists(error);
  }
}
