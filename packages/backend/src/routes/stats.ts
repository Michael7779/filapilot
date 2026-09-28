import { Router } from "express";
import { consumptionQuerySchema } from "@filapilot/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { accessibleInventoryIds, requireInventoryRole } from "../services/inventoryAccess.js";
import { computeConsumption } from "../services/statsService.js";
import { consumptionToCsv } from "../services/statsExportService.js";

export const statsRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;

async function resolveInventoryIds(user: Parameters<typeof requireInventoryRole>[0], inventoryId: string): Promise<string[]> {
  if (inventoryId === "all") {
    return accessibleInventoryIds(user);
  }
  await requireInventoryRole(user, inventoryId, "VIEWER");
  return [inventoryId];
}

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
    const inventoryIds = await resolveInventoryIds(getAuthenticatedUser(req), query.inventoryId);
    sendData(res, await computeConsumption(inventoryIds, query));
  })
);

// Derselbe Verbrauch als CSV-Datei zum Herunterladen - dieselbe Rechtepruefung wie beim Lesen, keine zusaetzlichen Felder.
// SCOPE: user
statsRouter.get(
  "/consumption/export",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const query = consumptionQuerySchema.parse(req.query);
    const inventoryIds = await resolveInventoryIds(getAuthenticatedUser(req), query.inventoryId);
    const stats = await computeConsumption(inventoryIds, query);
    const filename = `filapilot-verbrauch-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    // BOM voranstellen, damit Excel Umlaute korrekt als UTF-8 erkennt statt als Windows-1252 zu raten.
    res.send("﻿" + consumptionToCsv(stats));
  })
);
