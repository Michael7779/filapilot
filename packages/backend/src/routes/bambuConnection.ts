import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { AppError, sendData } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { createBambuRateLimiter } from "../middleware/rateLimit.js";
import { actorFromRequest, recordAudit } from "../services/auditService.js";
import { BambuCloudError, getBambuCloudClient, logBambuFailure } from "../services/bambuCloudClient.js";
import { deleteConnection, getConnectionInfo, getStoredToken, markSynced } from "../services/bambuConnectionService.js";
import { parseBambuHits, toAppError } from "../services/bambuImportService.js";
import { createSession } from "../services/bambuImportSessions.js";
import { describeSync, syncInventoryFromCloud } from "../services/bambuSyncService.js";
import { requireInventoryRole } from "../services/inventoryAccess.js";
import { getInventoryRow } from "../services/inventoryService.js";

// Gemountet unter /api/inventories/:id/bambu-import (vor dem Import-Router, damit "/connection" nicht als Sitzungs-ID gilt)
export const bambuConnectionRouter = Router({ mergeParams: true });

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const inventoryParamSchema = z.object({ id: z.string().uuid() });
// Der Abgleich nutzt das gemerkte Token (kein Passwort-Raten moeglich), ist aber trotzdem begrenzt.
const syncRateLimiter = createBambuRateLimiter(process.env.NODE_ENV === "test" ? 10_000 : 30);

// Threat-Model: Ein Benutzer ohne Recht koennte die gemerkte Verbindung eines Lagers benutzen, trennen oder ein fremdes Konto
// verbinden; das gemerkte Token koennte ausgelesen werden (Antwort, Protokoll, Log, Datenbank-Dump); ein fehlerhafter oder leerer
// Abgleich koennte zu Unrecht viele Spulen archivieren. Serverseitig erzwungen: Status lesen VIEWER, Abgleich und Auswahl-Import
// EDITOR, Trennen (und Verbinden beim Anmelden) nur OWNER; ohne Zugriff 404; das Token wird verschluesselt gespeichert und nie
// zurueckgegeben, geloggt oder protokolliert; bei Ablauf (401 der Cloud) wird es geloescht; nicht entschluesselbar = nicht
// verbunden; Verbindung gehoert zu genau einem Lager und wird mit ihm geloescht; Archivieren nur bei vollstaendiger, nicht leerer
// und nicht verdaechtig lueckenhafter Liste. Negativ-Tests: kein Cookie 401, Fremder 404, Betrachter/Bearbeiter beim Trennen 403,
// Betrachter beim Abgleich 403, Token nie in Antworten/Protokoll, abgelaufenes Token wird geloescht, leere Liste archiviert nichts.

// SCOPE: user
bambuConnectionRouter.get(
  "/connection",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    await requireInventoryRole(getAuthenticatedUser(req), id, "VIEWER");
    sendData(res, await getConnectionInfo(id));
  })
);

// SCOPE: user
bambuConnectionRouter.delete(
  "/connection",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    await requireInventoryRole(getAuthenticatedUser(req), id, "OWNER");
    const removed = await deleteConnection(id);
    if (removed) {
      const inventory = await getInventoryRow(id);
      await recordAudit({
        actor: actorFromRequest(req),
        action: "EVENT",
        area: "INVENTORY",
        entityId: id,
        inventory,
        description: `${inventory.name}: Bambu-Verbindung getrennt`
      });
    }
    sendData(res, { removed });
  })
);

// Import mit Auswahl ueber die gemerkte Verbindung: legt eine Sitzung mit dem gemerkten Token an (ohne erneutes Anmelden).
// SCOPE: user
bambuConnectionRouter.post(
  "/from-connection",
  syncRateLimiter,
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, "EDITOR");
    const stored = await getStoredToken(id);
    if (!stored) {
      throw new AppError("VALIDATION_ERROR", "Für dieses Lager ist keine Bambu-Verbindung gemerkt.");
    }
    const session = createSession({ userId: user.id, inventoryId: id, region: stored.region, token: stored.token });
    sendData(res, { status: "ok", sessionId: session.id });
  })
);

// Gleicht das Lager ohne Auswahl mit der Cloud ab.
// SCOPE: user
bambuConnectionRouter.post(
  "/sync",
  syncRateLimiter,
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    await requireInventoryRole(getAuthenticatedUser(req), id, "EDITOR");
    const stored = await getStoredToken(id);
    if (!stored) {
      throw new AppError("VALIDATION_ERROR", "Für dieses Lager ist keine Bambu-Verbindung gemerkt.");
    }
    let hits: unknown[];
    try {
      hits = await getBambuCloudClient().listFilaments(stored.region, stored.token);
    } catch (err) {
      logBambuFailure(err);
      if (err instanceof BambuCloudError && err.kind === "unauthorized") {
        // Das Token ist abgelaufen: die Verbindung verwerfen, damit sich der Benutzer neu anmeldet.
        await deleteConnection(id);
        throw new AppError("VALIDATION_ERROR", "Die gemerkte Bambu-Verbindung ist abgelaufen. Bitte neu anmelden (Aus Bambu-Cloud importieren).");
      }
      throw toAppError(err);
    }
    const { spools } = parseBambuHits(hits);
    const summary = await syncInventoryFromCloud(id, spools);
    const text = describeSync(summary);
    await markSynced(id, text);
    const inventory = await getInventoryRow(id);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "INVENTORY",
      entityId: id,
      inventory,
      description: `${inventory.name}: Abgleich mit Bambu-Cloud: ${text}`
    });
    sendData(res, summary);
  })
);
