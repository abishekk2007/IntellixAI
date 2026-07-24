import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data, error: null, meta: { requestId: res.locals.requestId } });
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "NOT_FOUND", "The requested resource was not found."));
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const multerCode = typeof error === "object" && error && "code" in error ? error.code : undefined;
  const normalized = multerCode === "LIMIT_FILE_SIZE"
    ? new AppError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the configured size limit.")
    : multerCode === "LIMIT_UNEXPECTED_FILE"
      ? new AppError(400, "INVALID_UPLOAD", "Upload exactly one file using the file field.")
    : error instanceof ZodError
    ? new AppError(400, "VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid request.")
    : error instanceof AppError
      ? error
      : new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
  return res.status(normalized.status).json({
    data: null,
    error: { code: normalized.code, message: normalized.message },
    meta: { requestId: res.locals.requestId },
  });
}
