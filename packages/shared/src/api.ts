export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "UPSTREAM_ERROR",
  "INTERNAL_ERROR"
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode;
  message: string;
}

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };
