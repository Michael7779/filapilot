import { Router } from "express";
import { z } from "zod";
import { spoolmanFileInputSchema } from "@filapilot/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { AppError, sendData } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { actorFromRequest } from "../services/auditService.js";
import { importSpoolmanEntries, parseSpoolmanEntries } from "../services/spoolmanImportService.js";
import { requireInventoryRole } from "../services/inventoryAccess.js";
import { getInventoryRow } from "../services/inventoryService.js";

// Gemountet unter /api/inventories/:id/spoolman-import
export const spoolmanImportRouter = Router({ mergeParams: true });

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const inventoryParamSchema = z.object({ id: z.string().uuid() });

// Threat-Model: Ein Benutzer ohne Bearbeiten-Recht koennte in ein fremdes Lager importieren; eine manipulierte
// Datei koennte riesig oder falsch aufgebaut sein und den Server belasten oder zum Absturz bringen.
// Serverseitig erzwungen: Rolle EDITOR im Ziel-Lager (fremd 404, Betrachter 403); Zod prueft die Datei (max. 2000
// Eintraege) und jede Spule einzeln (kaputte/unvollstaendige werden gezaehlt und uebersprungen, nie blind
// uebernommen); der Import laeuft in einer Transaktion. Anders als beim Bambu-Import ist keine Anmeldung noetig
// (Spoolman ist selbst-gehostet, ohne Cloud-Zugangsdaten) - nur eine hochgeladene Datei.
// Negativ-Tests: anonym -> 401, Fremde -> 404, Betrachter -> 403, ungueltiges/zu grosses JSON -> 400,
// Doppelimport wird verhindert (spoolmanId je Lager).
// SCOPE: user
spoolmanImportRouter.post(
  "/file",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, "EDITOR");
    const input = spoolmanFileInputSchema.parse(req.body);
    const { spools, skipped } = parseSpoolmanEntries(input.spools);
    if (spools.length === 0) {
      throw new AppError("VALIDATION_ERROR", "In der Datei wurden keine Spulen im erwarteten Format gefunden.");
    }
    const actor = actorFromRequest(req);
    const inventory = await getInventoryRow(id);
    const summary = await importSpoolmanEntries(id, spools, actor, inventory);
    sendData(res, { ...summary, skipped: summary.skipped + skipped });
  })
);
