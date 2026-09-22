import crypto from "node:crypto";
import { prisma } from "../prisma.js";
import { hashToken } from "./authService.js";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function createPasswordResetToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  await prisma.user.update({
    where: { id: userId },
    data: {
      resetToken: hashToken(rawToken),
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS)
    }
  });
  return rawToken;
}

export async function consumePasswordResetToken(rawToken: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { resetToken: hashToken(rawToken) } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return null;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: null, resetTokenExpiresAt: null }
  });
  return user.id;
}
