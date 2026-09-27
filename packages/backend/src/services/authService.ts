import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { getSettings } from "./settingsService.js";

const BCRYPT_ROUNDS = 12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function getSessionTtlMs(): Promise<number> {
  const { sessionExpiryDays } = await getSettings();
  return sessionExpiryDays * MS_PER_DAY;
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateRandomPassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export async function createSession(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const ttlMs = await getSessionTtlMs();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + ttlMs)
    }
  });
  return rawToken;
}

export async function findUserBySessionToken(rawToken: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true }
  });
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  return session.user;
}

export async function revokeSession(rawToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
