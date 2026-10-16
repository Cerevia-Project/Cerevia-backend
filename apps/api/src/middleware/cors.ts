import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

/**
 * CORS for a cross-origin frontend. Driven by FRONTEND_ORIGIN (empty in dev,
 * where the frontend and API share an origin). Credentials are enabled so the
 * httpOnly session cookie can be sent cross-origin.
 */
export function cors(req: Request, res: Response, next: NextFunction): void {
  if (env.frontendOrigin) {
    res.setHeader("Access-Control-Allow-Origin", env.frontendOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Idempotency-Key");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
