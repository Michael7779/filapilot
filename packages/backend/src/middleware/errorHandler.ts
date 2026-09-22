import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import type { ApiResult } from "@filapilot/shared";
import { AppError, statusForErrorCode } from "../lib/apiResult.js";
import { logger } from "../logger.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    const body: ApiResult<never> = {
      data: null,
      error: { code: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join("; ") }
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof AppError) {
    const body: ApiResult<never> = { data: null, error: { code: err.code, message: err.message } };
    res.status(statusForErrorCode(err.code)).json(body);
    return;
  }

  logger.error("Unhandled error", { err });
  const body: ApiResult<never> = {
    data: null,
    error: { code: "INTERNAL_ERROR", message: "Es ist ein unerwarteter Fehler aufgetreten." }
  };
  res.status(500).json(body);
}
