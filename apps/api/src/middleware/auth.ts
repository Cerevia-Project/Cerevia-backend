import type { NextFunction, Request, Response } from "express";
import { getCookie } from "../lib/cookies.js";
import { AppError } from "../lib/errors.js";
import * as authRepo from "../modules/auth/repository.js";

/**
 * Optional authentication: if a valid session cookie is present, attach
 * `req.user`, `req.ctx`, `req.csrfToken` and `req.orgName`. Does not throw when
 * unauthenticated — use `requireAuth` for protected routes.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const sid = getCookie(req, "sid");
    if (sid) {
      const session = await authRepo.findSessionById(sid);
      if (session) {
        const membership = await authRepo.findMembership(session.user_id, session.org_id);
        if (membership) {
          const permissions = await authRepo.findPermissions(membership.role_id);
          req.user = {
            id: session.user_id,
            email: session.email,
            name: session.name,
          };
          req.ctx = {
            orgId: session.org_id,
            userId: session.user_id,
            roles: [membership.role_name],
            permissions: new Set(permissions),
            allowedSourceIds: null,
          };
          req.csrfToken = session.csrf_token;
          req.orgName = session.org_name;
        }
      }
    }
  } catch (error) {
    return next(error);
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.ctx) {
    throw new AppError("UNAUTHENTICATED", "Authentication required");
  }
  next();
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.ctx) {
      throw new AppError("UNAUTHENTICATED", "Authentication required");
    }
    if (!req.ctx.permissions.has(permission)) {
      throw new AppError("FORBIDDEN", `Missing permission: ${permission}`);
    }
    next();
  };
}
