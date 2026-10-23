import { Router } from "express";
import { sizzleRefreshRequestSchema } from "@filapilot/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData } from "../lib/apiResult.js";
import { requireSizzleAccess } from "../middleware/access.js";
import { actorFromRequest, recordAudit } from "../services/auditService.js";
import { cancelCatalogSync, getRefreshStatus, loadCatalog, refreshCatalogIfDue, startCatalogRefresh } from "../services/sizzleCatalogService.js";

export const sizzleProductsRouter = Router();

// Ist der Katalog noch nie abgeglichen, wird beim Lesen hoechstens einmal pro Minute abgerufen.
const EMPTY_CATALOG_MIN_INTERVAL_MS = 60_000;
// Beim Oeffnen der Seite wird hoechstens alle 5 Minuten abgeglichen; der Knopf aktualisiert immer.
export const AUTO_REFRESH_MIN_INTERVAL_MS = 5 * 60_000;

// Threat-Model: Anonym oder ohne Freigabe darf niemand den Katalog lesen oder den Abgleich steuern (401/403, siehe requireSizzleAccess).
// Ein Freigegebener koennte versuchen, den Shop ueber "Aktualisieren" zu belasten oder eine eigene Adresse abrufen zu lassen: der Abruf
// nutzt eine feste Adresse (keine Eingabe), es laeuft nie mehr als ein Abgleich gleichzeitig, und der Rest des Servers ist durch das
// allgemeine Anfragelimit geschuetzt. Den laufenden Abgleich darf jeder Freigegebene abbrechen (gemeinsame Liste, der Abbruch laesst den
// Katalog unveraendert). Eingaben sind strikt (nur "auto" als Boolean, sonst 400); die Antwort enthaelt nur den Stand, keine Interna.
// Negativ-Tests: tests/security/sizzle.test.ts (401, 403 ohne Freigabe, 400 bei falscher Eingabe, Pausen, Abbruch, Shop-Fehler -> 502).
// SCOPE: user
sizzleProductsRouter.get(
  "/",
  ...requireSizzleAccess,
  asyncHandler(async (_req, res) => {
    let catalog = await loadCatalog();
    if (catalog.products.length === 0) {
      // Noch nie abgeglichen (frische Instanz): einmal abrufen; ein Shop-Fehler wird als 502 gemeldet
      if (await refreshCatalogIfDue(EMPTY_CATALOG_MIN_INTERVAL_MS)) {
        catalog = await loadCatalog();
      }
    }
    sendData(res, catalog);
  })
);

// Stand des Abgleichs (Schritt, Dauer), fuer die Fortschrittsanzeige.
// SCOPE: user
sizzleProductsRouter.get(
  "/refresh",
  ...requireSizzleAccess,
  asyncHandler(async (_req, res) => {
    sendData(res, getRefreshStatus());
  })
);

// Startet den Abgleich im Hintergrund und antwortet sofort mit dem Stand. { auto: true }: beim Oeffnen der Seite, nur wenn der letzte
// Abgleich laenger als 5 Minuten her ist; sonst (Knopf) immer.
// SCOPE: user
sizzleProductsRouter.post(
  "/refresh",
  ...requireSizzleAccess,
  asyncHandler(async (req, res) => {
    const input = sizzleRefreshRequestSchema.parse(req.body);
    const { started, status } = await startCatalogRefresh(input.auto ? AUTO_REFRESH_MIN_INTERVAL_MS : 0);
    if (started && !input.auto) {
      await recordAudit({ actor: actorFromRequest(req), action: "EVENT", area: "SIZZLE", description: "Katalog manuell aktualisiert" });
    }
    sendData(res, status);
  })
);

// SCOPE: user
sizzleProductsRouter.post(
  "/refresh/cancel",
  ...requireSizzleAccess,
  asyncHandler(async (_req, res) => {
    const cancelled = cancelCatalogSync();
    sendData(res, { cancelled, status: getRefreshStatus() });
  })
);
