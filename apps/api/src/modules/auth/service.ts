import { verify } from "argon2";
import { randomUUID } from "node:crypto";
import { newId } from "../../lib/ids.js";
import { AppError } from "../../lib/errors.js";
import * as repo from "./repository.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LoginResult {
  sessionId: string;
  csrfToken: string;
  user: { id: string; email: string; name: string; isSampleData: boolean };
  orgId: string;
  orgName: string;
  roles: string[];
  permissions: string[];
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await repo.findUserByEmail(email);
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Invalid email or password");
  }

  let ok = false;
  try {
    ok = await verify(user.password_hash, password);
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new AppError("UNAUTHENTICATED", "Invalid email or password");
  }

  const membership = await repo.findFirstMembership(user.id);
  if (!membership) {
    throw new AppError("UNAUTHENTICATED", "No organization membership for this user");
  }

  const sessionId = newId("ses");
  const csrfToken = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await repo.createSession(sessionId, user.id, membership.org_id, csrfToken, expiresAt);

  const permissions = await repo.findPermissions(membership.role_id);

  return {
    sessionId,
    csrfToken,
    user: { id: user.id, email: user.email, name: user.name, isSampleData: user.is_sample_data },
    orgId: membership.org_id,
    orgName: membership.org_name,
    roles: [membership.role_name],
    permissions,
  };
}

export async function logout(sessionId: string): Promise<void> {
  await repo.deleteSession(sessionId);
}
