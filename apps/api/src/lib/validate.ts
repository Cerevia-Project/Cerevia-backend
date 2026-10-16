import type { z } from "zod";
import { AppError } from "./errors.js";

/**
 * Parse untrusted input against a Zod schema; throw a RFC 9457 VALIDATION_FAILED
 * error on failure.
 */
export function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Request validation failed",
      result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    );
  }
  return result.data;
}
