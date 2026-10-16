import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError, problemDetails } from "../lib/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (res.locals.requestId as string | undefined) ?? "unknown";

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json(problemDetails(new AppError("FILE_TOO_LARGE", "File exceeds the size limit"), requestId));
      return;
    }
  }

  if (err instanceof AppError) {
    res.status(err.status).json(problemDetails(err, requestId));
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    type: "https://cerevia.dev/errors/internal",
    title: "Internal Server Error",
    status: 500,
    code: "INTERNAL",
    detail: "An unexpected error occurred",
    requestId,
  });
}
