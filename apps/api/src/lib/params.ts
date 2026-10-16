import type { Request } from "express";
import { AppError } from "./errors.js";

/** Read a path parameter as a string (Express 5 types it as string | string[] | undefined). */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw new AppError("VALIDATION_FAILED", `Invalid path parameter: ${name}`);
  }
  return value;
}
