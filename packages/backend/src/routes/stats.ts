import { Router } from "express";
import { consumptionQuerySchema } from "@filapilot/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { accessibleInventoryIds, requireInventoryRole } from "../services/inventoryAccess.js";
import { computeConsumption } from "../services/statsService.js";

export const statsRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;

// Threat-Model: Ein Fremder koennte den Verbrauch (und damit Kaufpreise) eines fremden Lagers lesen; ein riesiger Zeitraum oder eine
// ungueltige Zeitzone koennte den Server belasten oder Fehler ausloesen. Serverseitig erzwungen: Lesen braucht die Rolle VIEWER im
// Lager (Fremde 404), "all" liefert nur Lager mit Mitgliedschaft (Admins alle); Zod prueft Periode, Zeitraum und Zeitzone, die Anzahl
// der Zeitabschnitte ist auf 400 begrenzt, die gelesenen Verlaufs-Eintraege auf 100000. Negativ-Tests: kein Cookie -> 401, Fremder ->
// 404, "all" nur eigene Lager, ungueltige Eingaben -> 400.
// SCOPE: user
statsRouter.get(
  "/consumption",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const query = consumptionQuerySchema.parse(req.query);
    const user = getAuthenticatedUser(req);
    let inventoryIds: string[];
    if (query.inventoryId === "all") {
      inventoryIds = await accessibleInventoryIds(user);
    } else {
      await requireInventoryRole(user, query.inventoryId, "VIEWER");
      inventoryIds = [query.inventoryId];
    }
    sendData(res, await computeConsumption(inventoryIds, query));
  })
);
