import { Router } from "express";
import { auditQuerySchema } from "@filapilot/shared";
import { sendData } from "../lib/apiResult.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requirePasswordAlreadyChanged, requireRole } from "../middleware/auth.js";
import { listAudit } from "../services/auditService.js";

export const auditRouter = Router();

const requireAdmin = [requireAuth, requirePasswordAlreadyChanged, requireRole("ADMIN")] as const;

// Threat-Model: Das Protokoll zeigt, wer was geaendert hat, samt Vorher-/Nachher-Werten - ein normaler Benutzer
// duerfte das nicht lesen (Einblick in fremde Aktivitaet, E-Mail-Adressen, Konfiguration). Es ist ausserdem nur
// lesbar: es gibt bewusst keine Route zum Aendern oder Loeschen von Eintraegen. Serverseitig erzwungen:
// requireRole("ADMIN"); alle Filter werden per Zod validiert (Seitengroesse begrenzt, Datum als ISO) und laufen
// ueber Prisma-Parameter (keine SQL-Zusammenstellung aus Eingaben).
// Negativ-Tests: kein Cookie -> 401, USER -> 403, ungueltige Filter -> 400.
// SCOPE: global
auditRouter.get(
  "/",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    sendData(res, await listAudit(auditQuerySchema.parse(req.query)));
  })
);
