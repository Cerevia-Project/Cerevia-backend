import { hash } from "argon2";
import { newId } from "../lib/ids.js";
import { getPool, withTransaction } from "./postgres.js";

/**
 * Seed a default organization + admin user if none exist. Idempotent.
 */
export async function bootstrap(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@cerevia.dev";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin12345";
  const orgName = process.env.BOOTSTRAP_ORG_NAME ?? "Cerevia";

  const existing = await getPool().query("SELECT id FROM organizations LIMIT 1");
  if (existing.rowCount) {
    console.log("Bootstrap skipped: an organization already exists.");
    return;
  }

  const orgId = newId("org");
  const userId = newId("usr");
  const passwordHash = await hash(password);

  await withTransaction(async (client) => {
    await client.query("INSERT INTO organizations (id, name) VALUES ($1, $2)", [orgId, orgName]);
    await client.query(
      "INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)",
      [userId, email, "Admin", passwordHash],
    );
    await client.query(
      "INSERT INTO memberships (id, org_id, user_id, role_id) VALUES ($1, $2, $3, 'role_org_admin')",
      [newId("mem"), orgId, userId],
    );
  });

  console.log(`Bootstrap complete: org="${orgName}" admin=${email}`);
}
