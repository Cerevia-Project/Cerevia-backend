export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "AI_UNAVAILABLE"
  | "INTERNAL";

const TITLES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Unauthenticated",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "Not Found",
  VALIDATION_FAILED: "Validation Failed",
  CONFLICT: "Conflict",
  RATE_LIMITED: "Too Many Requests",
  UNSUPPORTED_FILE_TYPE: "Unsupported Media Type",
  FILE_TOO_LARGE: "Payload Too Large",
  AI_UNAVAILABLE: "AI Unavailable",
  INTERNAL: "Internal Server Error",
};

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNSUPPORTED_FILE_TYPE: 415,
  FILE_TOO_LARGE: 413,
  AI_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export interface FieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fieldErrors: FieldError[] | undefined;

  constructor(code: ErrorCode, message: string, fieldErrors?: FieldError[]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fieldErrors = fieldErrors;
  }
}

export function problemDetails(error: AppError, requestId: string) {
  const body: Record<string, unknown> = {
    type: `https://cerevia.dev/errors/${error.code.toLowerCase()}`,
    title: TITLES[error.code],
    status: error.status,
    code: error.code,
    detail: error.message,
    requestId,
  };
  if (error.fieldErrors) {
    body.fieldErrors = error.fieldErrors;
  }
  return body;
}
