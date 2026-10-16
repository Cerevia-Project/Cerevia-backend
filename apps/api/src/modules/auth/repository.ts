import { query } from "../../db/postgres.js";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  is_sample_data: boolean;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await query<UserRow>(
    "SELECT id, email, name, password_hash, is_sample_data FROM users WHERE email = $1",
    [email],
  );
  return result.rows[0] ?? null;
}

export interface MembershipRow {
  org_id: string;
  org_name: string;
  role_id: string;
  role_name: string;
}

export async function findMembership(userId: string, orgId: string): Promise<MembershipRow | null> {
  const result = await query<MembershipRow>(
    `SELECT m.org_id, o.name AS org_name, m.role_id, r.name AS role_name
     FROM memberships m
     JOIN organizations o ON o.id = m.org_id
     JOIN roles r ON r.id = m.role_id
     WHERE m.user_id = $1 AND m.org_id = $2`,
    [userId, orgId],
  );
  return result.rows[0] ?? null;
}

export async function findFirstMembership(userId: string): Promise<MembershipRow | null> {
  const result = await query<MembershipRow>(
    `SELECT m.org_id, o.name AS org_name, m.role_id, r.name AS role_name
     FROM memberships m
     JOIN organizations o ON o.id = m.org_id
     JOIN roles r ON r.id = m.role_id
     WHERE m.user_id = $1
     ORDER BY m.created_at ASC
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function findPermissions(roleId: string): Promise<string[]> {
  const result = await query<{ permission: string }>(
    "SELECT permission FROM role_permissions WHERE role_id = $1",
    [roleId],
  );
  return result.rows.map((r) => r.permission);
}

export interface SessionRow {
  id: string;
  user_id: string;
  org_id: string;
  csrf_token: string;
  expires_at: Date;
  email: string;
  name: string;
  user_is_sample_data: boolean;
  org_name: string;
}

export async function findSessionById(id: string): Promise<SessionRow | null> {
  const result = await query<SessionRow>(
    `SELECT s.id, s.user_id, s.org_id, s.csrf_token, s.expires_at,
            u.email, u.name, u.is_sample_data AS user_is_sample_data,
            o.name AS org_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN organizations o ON o.id = s.org_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function createSession(
  id: string,
  userId: string,
  orgId: string,
  csrfToken: string,
  expiresAt: Date,
): Promise<void> {
  await query(
    "INSERT INTO sessions (id, user_id, org_id, csrf_token, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [id, userId, orgId, csrfToken, expiresAt],
  );
}

export async function deleteSession(id: string): Promise<void> {
  await query("DELETE FROM sessions WHERE id = $1", [id]);
}
