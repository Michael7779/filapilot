import type { Response } from "express";
import { createSession } from "../services/authService.js";
import { SESSION_COOKIE_NAME } from "../middleware/auth.js";

const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export async function startSession(res: Response, userId: string): Promise<void> {
  const rawToken = await createSession(userId);
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_COOKIE_MAX_AGE_MS
  });
}
