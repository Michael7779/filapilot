import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData } from "../lib/apiResult.js";
import { requireSizzleAccess } from "../middleware/access.js";
import { actorFromRequest, recordAudit } from "../services/auditService.js";
import { loadCatalog, refreshCatalogIfDue } from "../services/sizzleCatalogService.js";

export const sizzleProductsRouter = Router();

// Haeufiger als einmal pro Minute wird der Shop nie abgefragt, egal wie oft jemand auf "Aktualisieren" tippt.
const MIN_REFRESH_INTERVAL_MS = 60_000;

// Threat-Model: Anonym oder ohne Freigabe darf niemand den Katalog lesen (401/403, siehe requireSizzleAccess). Ein Freigegebener
// koennte versuchen, den Shop ueber "Aktualisieren" zu belasten oder eine eigene Adresse abrufen zu lassen: der Abruf nutzt eine
// feste Adresse (keine Eingabe), und der Abgleich laeuft hoechstens einmal pro Minute (auch fehlgeschlagene Versuche zaehlen).
// Negativ-Tests: tests/security/sizzle.test.ts (401, 403 ohne Freigabe, Abkuehlzeit, Shop-Fehler -> 502).
// SCOPE: user
sizzleProductsRouter.get(
  "/",
  ...requireSizzleAccess,
  asyncHandler(async (_req, res) => {
    let catalog = await loadCatalog();
    if (catalog.products.length === 0) {
      // Noch nie abgeglichen (frische Instanz): einmal abrufen; ein Shop-Fehler wird als 502 gemeldet
      if (await refreshCatalogIfDue(MIN_REFRESH_INTERVAL_MS)) {
        catalog = await loadCatalog();
      }
    }
    sendData(res, catalog);
  })
);

// SCOPE: user
sizzleProductsRouter.post(
  "/refresh",
  ...requireSizzleAccess,
  asyncHandler(async (req, res) => {
    const refreshed = await refreshCatalogIfDue(MIN_REFRESH_INTERVAL_MS);
    const catalog = await loadCatalog();
    if (refreshed) {
      await recordAudit({
        actor: actorFromRequest(req),
        action: "EVENT",
        area: "SIZZLE",
        description: `Katalog aktualisiert (${catalog.products.length} Produkte)`
      });
    }
    sendData(res, catalog);
  })
);
