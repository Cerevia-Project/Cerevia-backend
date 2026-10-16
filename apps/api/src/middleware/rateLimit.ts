import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Fixed-window, in-memory rate limiter keyed by tenant user (or IP for
 * anonymous requests). The `api_rate_limits` table exists for a distributed
 * limiter later; this is the single-instance dev baseline.
 */
export function rateLimit(options: { windowMs?: number; max?: number } = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 300;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ctx ? `${req.ctx.orgId}:${req.ctx.userId}` : (req.ip ?? "anon");
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 1, resetAt: now + windowMs };
      buckets.set(key, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      throw new AppError("RATE_LIMITED", "Rate limit exceeded");
    }
    next();
  };
}
