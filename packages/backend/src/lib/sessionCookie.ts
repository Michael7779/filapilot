import type { Response } from "express";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { createSession } from "../services/authService.js";
import { SESSION_COOKIE_NAME } from "../middleware/auth.js";

const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Das Flag "secure" sagt dem Browser, das Cookie nur ueber HTTPS zu senden. Ueber eine normale http-Adresse (z.B.
// http://192.168.1.50:8090 im Heimnetz) speichert der Browser ein solches Cookie gar nicht - die Anmeldung wuerde
// nie funktionieren. Deshalb gilt "secure" genau dann, wenn die App ueber HTTPS aufgerufen wird: die konfigurierte
// Adresse (FRONTEND_ORIGIN) beginnt mit https:// oder der Request kam nachweislich ueber HTTPS.
export function isSecureCookie(frontendOrigin: string, requestIsSecure: boolean): boolean {
  return frontendOrigin.startsWith("https://") || requestIsSecure;
}

export async function startSession(res: Response, userId: string): Promise<void> {
  const rawToken = await createSession(userId);
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isSecureCookie(env.FRONTEND_ORIGIN, res.req.secure),
    sameSite: "lax",
    maxAge: SESSION_COOKIE_MAX_AGE_MS
  });
}
