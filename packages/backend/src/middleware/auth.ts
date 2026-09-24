import type { NextFunction, Request, Response } from "express";
import type { User, UserRole } from "@prisma/client";
import { AppError } from "../lib/apiResult.js";
import { prisma } from "../prisma.js";
import { findUserBySessionToken } from "../services/authService.js";

const SESSION_COOKIE_NAME = "fp_session";
// "Zuletzt aktiv" wird hoechstens einmal pro Minute geschrieben - nicht bei jedem Request.
const ACTIVITY_UPDATE_INTERVAL_MS = 60_000;

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken: unknown = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof rawToken !== "string" || rawToken.length === 0) {
      next(new AppError("UNAUTHORIZED", "Anmeldung erforderlich."));
      return;
    }

    const user = await findUserBySessionToken(rawToken);
    if (!user) {
      next(new AppError("UNAUTHORIZED", "Sitzung ungueltig oder abgelaufen."));
      return;
    }

    const now = new Date();
    if (!user.lastActiveAt || now.getTime() - user.lastActiveAt.getTime() > ACTIVITY_UPDATE_INTERVAL_MS) {
      await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: now } });
      user.lastActiveAt = now;
    }

    req.user = user;
    next();
  } catch (err) {
    // Async-Middleware: ohne das wuerde ein Datenbankfehler den Prozess beenden.
    next(err);
  }
}

// Nach requireAuth einsetzen auf jeder Route AUSSER /api/auth/change-password und
// /api/auth/logout - ein Nutzer mit mustChangePassword darf sonst nichts erreichen.
export function requirePasswordAlreadyChanged(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.user?.mustChangePassword) {
    next(new AppError("FORBIDDEN", "Passwort muss zuerst geaendert werden."));
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError("FORBIDDEN", "Dafuer fehlt die Berechtigung."));
      return;
    }
    next();
  };
}

// Liest req.user typsicher ohne "!" - wirft, falls requireAuth aus Versehen fehlt
// (Programmierfehler, nicht der normale 401-Pfad eines echten Requests).
export function getAuthenticatedUser(req: Request): User {
  if (!req.user) {
    throw new Error("getAuthenticatedUser() ohne vorherige requireAuth-Middleware aufgerufen.");
  }
  return req.user;
}

export { SESSION_COOKIE_NAME };
