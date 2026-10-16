import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./postgres.js";

const migrationsDir = fileURLToPath(new URL("./migrations/", import.meta.url));

/**
 * Minimal SQL migration runner. Applies `NNN_*.sql` files in order, tracking
 * applied migrations in `schema_migrations`. Run via `pnpm --filter api migrate`.
 */
export async function migrate(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const already = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (already.rowCount) continue;

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`✓ applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed`, { cause: error });
      }
    }
  } finally {
    client.release();
  }
}
