import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LOGIN_PATH = "/api/v1/auth/login";

/**
 * Session-bound CSRF: mutating requests must carry an `X-CSRF-Token` header
 * matching the current session's token. Login has no session yet, so it is
 * exempt (protected by SameSite=Lax cookies).
 */
export function csrf(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || req.path === LOGIN_PATH) {
    next();
    return;
  }

  const token = req.header("X-CSRF-Token");
  if (!req.csrfToken || !token || token !== req.csrfToken) {
    throw new AppError("FORBIDDEN", "Invalid or missing CSRF token");
  }
  next();
}
