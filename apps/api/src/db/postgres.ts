import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "../config/env.js";

export type { PoolClient };

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(
      env.postgres.url
        ? { connectionString: env.postgres.url }
        : {
            host: env.postgres.host,
            port: env.postgres.port,
            user: env.postgres.user,
            password: env.postgres.password,
            database: env.postgres.database,
            ...(env.postgres.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
          },
    );
  }
  return pool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/**
 * Run `fn` on a dedicated client inside a transaction. Intended for multi-statement
 * operations that must be atomic (FalkorDB has no multi-query transactions, but
 * Postgres does).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
