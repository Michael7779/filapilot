import { Router } from "express";
import { bulkCreateSpoolsInputSchema } from "@filapilot/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { actorFromRequest } from "../services/auditService.js";
import { requireInventoryRole } from "../services/inventoryAccess.js";
import { createSpoolsBulk } from "../services/spoolBulkService.js";

// Gemountet unter /api/spools (wie spoolWeigh.ts) - definiert selbst den vollen Unterpfad.
export const spoolsBulkRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;

// Mehrere neue Spulen auf einmal ("Mehrere Spulen"-Dialog).
// Threat-Model: Ein anonymer Request, ein Nutzer ohne Mitgliedschaft oder ein Betrachter koennte Spulen in ein
// fremdes Lager schreiben; ein Nutzer koennte mit einer riesigen Anfrage die Datenbank fluten oder mit einer
// unpassenden Material/Hersteller-Kombination Unsinn anlegen. Serverseitig erzwungen: requireAuth +
// requirePasswordAlreadyChanged, die Rolle EDITOR im Ziel-Lager wird aus der Datenbank berechnet (Fremder -> 404,
// Betrachter -> 403), Zod mit harten Obergrenzen (max. 100 Eintraege, 200 Spulen, je Eintrag max. 50), Material und
// Hersteller werden vorab geprueft, die Anlage laeuft in einer Transaktion (alles oder nichts).
// Negativ-Tests: kein Cookie -> 401, mustChangePassword -> 403, Fremder -> 404, Betrachter -> 403, zu viele Spulen -> 400,
// falsche Material/Hersteller-Kombination -> 400 ohne angelegte Spule (tests/security/spoolsBulk.test.ts).
// SCOPE: user
spoolsBulkRouter.post(
  "/bulk",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const input = bulkCreateSpoolsInputSchema.parse(req.body);
    await requireInventoryRole(getAuthenticatedUser(req), input.inventoryId, "EDITOR");
    const { ids } = await createSpoolsBulk(input, actorFromRequest(req));
    sendData(res, { created: ids.length, ids }, 201);
  })
);
