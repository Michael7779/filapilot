import { Router, type Request } from "express";
import { z } from "zod";
import {
  bambuFileInputSchema,
  bambuImportInputSchema,
  bambuLoginInputSchema,
  bambuResendInputSchema,
  bambuVerifyInputSchema,
  type BambuLoginResult
} from "@filapilot/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { AppError, sendData } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { bambuRateLimiter } from "../middleware/rateLimit.js";
import { actorFromRequest, recordAudit } from "../services/auditService.js";
import { getBambuCloudClient, logBambuFailure } from "../services/bambuCloudClient.js";
import { buildPreview, importSelected, parseBambuHits, toAppError } from "../services/bambuImportService.js";
import {
  RESEND_COOLDOWN_MS,
  createSession,
  deleteSession,
  getSession,
  sessionNow,
  type ImportSession
} from "../services/bambuImportSessions.js";
import { saveConnection } from "../services/bambuConnectionService.js";
import { requireInventoryRole } from "../services/inventoryAccess.js";
import { getInventoryRow } from "../services/inventoryService.js";

// Gemountet unter /api/inventories/:id/bambu-import
export const bambuImportRouter = Router({ mergeParams: true });

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const inventoryParamSchema = z.object({ id: z.string().uuid() });
const sessionParamSchema = z.object({ id: z.string().uuid(), sessionId: z.string().min(10).max(100) });

// Threat-Model: Ein Benutzer ohne Bearbeiten-Recht koennte in ein fremdes Lager importieren; ein anderer Benutzer koennte die
// Import-Sitzung (mit dem Bambu-Token) eines Kollegen benutzen; Passwort oder Token koennten in Logs, im Protokoll oder in
// Fehlermeldungen landen; der Server koennte zu Anfragen an beliebige Adressen gebracht werden; jemand koennte ueber FilaPilot
// Passwoerter von Bambu-Konten durchprobieren; ein manipuliertes JSON koennte riesig oder falsch aufgebaut sein.
// Serverseitig erzwungen: Rolle EDITOR im Lager bei jeder Route (fremd 404, Betrachter 403); jede Sitzung gehoert einem
// Benutzer und einem Lager (sonst 404) und liegt nur im Speicher (15 Minuten, max. 3 je Benutzer, nach dem Import geloescht);
// Ziel-Adressen sind fest (nur Region global/china waehlbar); Passwort und Token werden nie gespeichert, geloggt oder
// protokolliert, Fehler nennen nur die Art; Begrenzung der Anmeldeversuche wie bei der Anmeldung; Zod fuer alle Eingaben und
// jede Spule aus der Cloud/Datei (max. 1000 Eintraege, Import max. 500 IDs).
// Negativ-Tests: kein Cookie -> 401, Fremder -> 404, Betrachter -> 403, fremde/abgelaufene Sitzung -> 404, ungueltige Region
// -> 400, manipuliertes JSON -> 400, keine Geheimnisse im Protokoll/in Antworten.

// Merkt die Verbindung fuer das Lager, wenn der Besitzer es beim Anmelden gewuenscht hat (Recht wurde vorab geprueft).
async function storeConnectionIfWanted(session: ImportSession, req: Request): Promise<void> {
  if (!session.remember || !session.token) {
    return;
  }
  const user = getAuthenticatedUser(req);
  await saveConnection({ inventoryId: session.inventoryId, region: session.region, token: session.token, connectedByName: user.username });
  const inventory = await getInventoryRow(session.inventoryId);
  await recordAudit({
    actor: actorFromRequest(req),
    action: "EVENT",
    area: "INVENTORY",
    entityId: session.inventoryId,
    inventory,
    description: `${inventory.name}: Bambu-Verbindung gemerkt`
  });
}

// SCOPE: user
bambuImportRouter.post(
  "/login",
  bambuRateLimiter,
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    const input = bambuLoginInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, input.remember ? "OWNER" : "EDITOR");
    const client = getBambuCloudClient();
    let result: BambuLoginResult;
    let created: ImportSession | null = null;
    try {
      const outcome = await client.login(input.region, input.account, input.password);
      if (outcome.kind === "ok") {
        created = createSession({ userId: user.id, inventoryId: id, region: input.region, token: outcome.token, remember: input.remember });
        result = { status: "ok", sessionId: created.id };
      } else if (outcome.kind === "code_required") {
        // Bambu verschickt bei diesem Schritt nach eigenen Regeln bereits einen Code; ein weiterer wird nur auf Wunsch
        // angefordert (/resend), um den Posteingang nicht zu fluten.
        result = {
          status: "code_required",
          sessionId: createSession({
            userId: user.id,
            inventoryId: id,
            region: input.region,
            pendingAccount: input.account,
            remember: input.remember
          }).id
        };
      } else {
        result = { status: "tfa_unsupported", sessionId: null };
      }
    } catch (err) {
      logBambuFailure(err);
      throw toAppError(err);
    }
    if (created) {
      await storeConnectionIfWanted(created, req);
    }
    sendData(res, result);
  })
);

// SCOPE: user
bambuImportRouter.post(
  "/verify",
  bambuRateLimiter,
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    const input = bambuVerifyInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, "EDITOR");
    const session = getSession(input.sessionId, user.id, id);
    if (!session.pendingAccount) {
      throw new AppError("VALIDATION_ERROR", "Für diese Sitzung wird kein Code erwartet.");
    }
    try {
      session.token = await getBambuCloudClient().loginWithCode(session.region, session.pendingAccount, input.code);
    } catch (err) {
      logBambuFailure(err);
      throw toAppError(err);
    }
    session.pendingAccount = null;
    await storeConnectionIfWanted(session, req);
    sendData(res, { status: "ok", sessionId: session.id } satisfies BambuLoginResult);
  })
);

// Code (erneut) per E-Mail anfordern - hoechstens einmal pro Minute je Sitzung.
// SCOPE: user
bambuImportRouter.post(
  "/resend",
  bambuRateLimiter,
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    const input = bambuResendInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, "EDITOR");
    const session = getSession(input.sessionId, user.id, id);
    if (!session.pendingAccount) {
      throw new AppError("VALIDATION_ERROR", "Für diese Sitzung wird kein Code erwartet.");
    }
    if (session.codeSentAt !== null && sessionNow() - session.codeSentAt < RESEND_COOLDOWN_MS) {
      throw new AppError("VALIDATION_ERROR", "Bitte etwa eine Minute warten, bevor du den Code erneut anforderst.");
    }
    try {
      await getBambuCloudClient().sendCode(session.region, session.pendingAccount);
    } catch (err) {
      logBambuFailure(err);
      throw toAppError(err);
    }
    session.codeSentAt = sessionNow();
    sendData(res, { sent: true });
  })
);

// Ausweichweg ohne Anmeldung: die Filamentliste als JSON-Datei.
// SCOPE: user
bambuImportRouter.post(
  "/file",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, "EDITOR");
    const input = bambuFileInputSchema.parse(req.body);
    const { spools, skipped } = parseBambuHits(input.hits);
    if (spools.length === 0) {
      throw new AppError("VALIDATION_ERROR", "In der Datei wurden keine Spulen im erwarteten Format gefunden.");
    }
    const session = createSession({ userId: user.id, inventoryId: id, region: "global", spools, skipped });
    sendData(res, { status: "ok", sessionId: session.id } satisfies BambuLoginResult);
  })
);

// SCOPE: user
bambuImportRouter.get(
  "/:sessionId/preview",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id, sessionId } = sessionParamSchema.parse(req.params);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, "EDITOR");
    const session = getSession(sessionId, user.id, id);
    if (!session.spools) {
      if (!session.token) {
        throw new AppError("VALIDATION_ERROR", "Bitte zuerst anmelden.");
      }
      try {
        const parsed = parseBambuHits(await getBambuCloudClient().listFilaments(session.region, session.token));
        session.spools = parsed.spools;
        session.skipped = parsed.skipped;
      } catch (err) {
        logBambuFailure(err);
        throw toAppError(err);
      }
    }
    sendData(res, await buildPreview(id, session));
  })
);

// SCOPE: user
bambuImportRouter.post(
  "/:sessionId/import",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id, sessionId } = sessionParamSchema.parse(req.params);
    const input = bambuImportInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, "EDITOR");
    const session = getSession(sessionId, user.id, id);
    if (!session.spools) {
      throw new AppError("VALIDATION_ERROR", "Bitte zuerst die Vorschau laden.");
    }
    const summary = await importSelected(id, session, input);
    // Das Token wird nach dem Import sofort verworfen.
    deleteSession(sessionId);
    const inventory = await getInventoryRow(id);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "INVENTORY",
      entityId: id,
      inventory,
      description: `${inventory.name}: Import aus Bambu-Cloud: ${summary.created} neu, ${summary.updated} aktualisiert, ${summary.skipped} übersprungen`
    });
    sendData(res, summary);
  })
);

// SCOPE: user
bambuImportRouter.delete(
  "/:sessionId",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id, sessionId } = sessionParamSchema.parse(req.params);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, "EDITOR");
    getSession(sessionId, user.id, id);
    deleteSession(sessionId);
    sendData(res, { deleted: true });
  })
);
