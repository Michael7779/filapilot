import type { BambuSyncSummary } from "@filapilot/shared";
import { AppError } from "../lib/apiResult.js";
import { BambuCloudError, getBambuCloudClient, logBambuFailure } from "./bambuCloudClient.js";
import { deleteConnection, getStoredToken, markSyncFailed, markSynced } from "./bambuConnectionService.js";
import { parseBambuHits, toAppError } from "./bambuImportService.js";
import { describeSync, syncInventoryFromCloud } from "./bambuSyncService.js";
import { recordAudit, type AuditActor } from "./auditService.js";
import { getInventoryRow } from "./inventoryService.js";

// Ein kompletter Abgleich eines Lagers mit der Bambu-Cloud ueber das gemerkte Token (von Hand oder per Zeitplan).
// Bei Fehlern wird der Grund am Lager vermerkt; ein abgelaufenes Token (401) verwirft die Verbindung.
export async function runCloudSync(inventoryId: string, actor: AuditActor, auto: boolean): Promise<BambuSyncSummary> {
  const stored = await getStoredToken(inventoryId);
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
      await deleteConnection(inventoryId);
      throw new AppError("VALIDATION_ERROR", "Die gemerkte Bambu-Verbindung ist abgelaufen. Bitte neu anmelden (Aus Bambu-Cloud importieren).");
    }
    const appError = toAppError(err);
    await markSyncFailed(inventoryId, appError.message, auto);
    throw appError;
  }
  const { spools } = parseBambuHits(hits);
  const summary = await syncInventoryFromCloud(inventoryId, spools);
  const text = describeSync(summary);
  await markSynced(inventoryId, text, auto);
  const inventory = await getInventoryRow(inventoryId);
  await recordAudit({
    actor,
    action: "EVENT",
    area: "INVENTORY",
    entityId: inventoryId,
    inventory,
    description: `${inventory.name}: ${auto ? "Automatischer Abgleich" : "Abgleich"} mit Bambu-Cloud: ${text}`
  });
  return summary;
}
