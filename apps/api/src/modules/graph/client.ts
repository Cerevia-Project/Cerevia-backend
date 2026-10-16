import { FalkorDB, type Graph } from "falkordb";
import { env } from "../../config/env.js";

let dbPromise: Promise<FalkorDB> | undefined;

export async function getDB(): Promise<FalkorDB> {
  if (!dbPromise) {
    dbPromise = FalkorDB.connect({
      host: env.falkordb.host,
      port: env.falkordb.port,
      ...(env.falkordb.password ? { password: env.falkordb.password } : {}),
    }).catch((error: unknown) => {
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

/**
 * The tenant's graph, selected from the orgId (one graph per organization).
 * The repository must derive orgId from TenantContext, never client input.
 */
export async function getTenantGraph(orgId: string): Promise<Graph> {
  const db = await getDB();
  return db.selectGraph(`org_${orgId}`);
}
