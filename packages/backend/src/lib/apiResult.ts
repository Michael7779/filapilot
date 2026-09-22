import type { Response } from "express";
import type { ApiResult, ErrorCode } from "@filapilot/shared";

export function sendData<T>(res: Response, data: T, status = 200): void {
  const body: ApiResult<T> = { data, error: null };
  res.status(status).json(body);
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  INTERNAL_ERROR: 500
};

export function statusForErrorCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}
