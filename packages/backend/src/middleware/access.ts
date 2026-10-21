import type { NextFunction, Request, Response } from "express";
import { userAccess, type UserAccess } from "@filapilot/shared";
import { AppError } from "../lib/apiResult.js";
import { requireAuth, requirePasswordAlreadyChanged } from "./auth.js";

// Freigaben pro Bereich (Filamentverwaltung bzw. SizzleBrothers-Wunschliste): immer serverseitig pruefen, das Ausblenden des
// Menuepunktes im Browser schuetzt nichts. Super-Admins haben immer Zugriff (siehe userAccess).
function requireArea(area: keyof UserAccess, message: string) {
  const check = (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !userAccess(req.user)[area]) {
      next(new AppError("FORBIDDEN", message));
      return;
    }
    next();
  };
  // Erst anmelden (401), dann Freigabe pruefen (403) - die Route selbst meldet danach nicht erneut an (requireAuth ist idempotent).
  return [requireAuth, requirePasswordAlreadyChanged, check] as const;
}

export const requireFilamentAccess = requireArea("filament", "Die Filamentverwaltung ist fuer dieses Konto nicht freigegeben.");
export const requireSizzleAccess = requireArea("sizzle", "Die SizzleBrothers-Wunschliste ist fuer dieses Konto nicht freigegeben.");
