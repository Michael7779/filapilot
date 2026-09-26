import type { BambuSpool, BambuSyncSummary } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { buildImportContext, createSpoolFromCloud, mapBambuSpool, type ImportContext, type MappedSpool, type Tx } from "./bambuImportService.js";
import { recordWeightChange } from "./spoolWeightLog.js";

interface LinkedSpool {
  id: string;
  bambuCloudId: string | null;
  initialWeightG: number;
  remainingWeightG: number;
  archivedAt: Date | null;
  archiveReason: "MANUAL" | "CLOUD_REMOVED" | null;
}

// Ab dieser Menge (und mehr als die Haelfte der aktiven Cloud-Spulen) gilt "fehlt in der Cloud" als verdaechtig.
const SUSPICIOUS_MISSING_COUNT = 5;

async function syncOne(
  context: ImportContext,
  existing: LinkedSpool | undefined,
  spool: MappedSpool,
  summary: BambuSyncSummary
): Promise<void> {
  if (!existing) {
    // Neue Spule: nur mit Status 0 (oder ohne Status) - die Bedeutung anderer Werte ist nicht dokumentiert.
    if (spool.status !== null && spool.status !== 0) {
      summary.skipped += 1;
      return;
    }
    await createSpoolFromCloud(context, spool);
    summary.created += 1;
    return;
  }
  // Von Hand archivierte Spulen bleiben unangetastet.
  if (existing.archivedAt && existing.archiveReason === "MANUAL") {
    summary.skipped += 1;
    return;
  }
  const remaining = Math.min(spool.remainingG, existing.initialWeightG);
  const restore = existing.archivedAt !== null;
  const changed = remaining !== existing.remainingWeightG;
  if (!changed && !restore) {
    summary.unchanged += 1;
    return;
  }
  await context.tx.spool.update({
    where: { id: existing.id },
    data: { remainingWeightG: remaining, ...(restore ? { archivedAt: null, archiveReason: null } : {}) }
  });
  await recordWeightChange(
    { spoolId: existing.id, inventoryId: context.inventoryId, before: existing.remainingWeightG, after: remaining, source: "CLOUD_SYNC" },
    context.tx
  );
  if (restore) {
    summary.restored += 1;
  }
  if (changed) {
    summary.updated += 1;
  }
}

// In FilaPilot mit Cloud-ID, in der Cloud nicht mehr vorhanden: als erledigt archivieren - ausser die Liste sieht falsch aus.
async function archiveMissing(tx: Tx, linked: LinkedSpool[], cloudIds: Set<string>, summary: BambuSyncSummary): Promise<void> {
  const active = linked.filter((spool) => !spool.archivedAt);
  const missing = active.filter((spool) => !cloudIds.has(spool.bambuCloudId ?? ""));
  if (missing.length === 0) {
    return;
  }
  if (cloudIds.size === 0 || (missing.length > SUSPICIOUS_MISSING_COUNT && missing.length > active.length / 2)) {
    summary.archiveBlocked = true;
    return;
  }
  await tx.spool.updateMany({
    where: { id: { in: missing.map((spool) => spool.id) } },
    data: { archivedAt: new Date(), archiveReason: "CLOUD_REMOVED" }
  });
  summary.archived = missing.length;
}

// Gleicht ein Lager mit der (vollstaendig geladenen) Spulenliste der Cloud ab, ohne Auswahl, in EINER Transaktion:
// bestehende Spulen bekommen das Restgewicht der Cloud (Verlauf wird geschrieben), neue werden angelegt, in der Cloud entfernte
// archiviert (und bei Rueckkehr wiederhergestellt). Die Cloud gewinnt bei Spulen aus der Cloud.
export async function syncInventoryFromCloud(inventoryId: string, cloud: BambuSpool[]): Promise<BambuSyncSummary> {
  const mapped = cloud.map((spool) => mapBambuSpool(spool));
  const cloudIds = new Set(mapped.map((spool) => spool.cloudId));
  const summary: BambuSyncSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    restored: 0,
    archived: 0,
    skipped: 0,
    archiveBlocked: false,
    manufacturersCreated: 0,
    materialsCreated: 0
  };

  await prisma.$transaction(
    async (tx) => {
      const linked = await tx.spool.findMany({
        where: { inventoryId, bambuCloudId: { not: null } },
        select: { id: true, bambuCloudId: true, initialWeightG: true, remainingWeightG: true, archivedAt: true, archiveReason: true }
      });
      const byCloudId = new Map(linked.map((spool) => [spool.bambuCloudId, spool]));
      const context = await buildImportContext(tx, {
        inventoryId,
        input: { cloudIds: [], updateExisting: true },
        summary: { created: 0, updated: 0, skipped: 0, manufacturersCreated: 0, materialsCreated: 0 },
        existing: new Map()
      });
      for (const spool of mapped) {
        await syncOne(context, byCloudId.get(spool.cloudId), spool, summary);
      }
      await archiveMissing(tx, linked, cloudIds, summary);
      summary.manufacturersCreated = context.summary.manufacturersCreated;
      summary.materialsCreated = context.summary.materialsCreated;
    },
    { timeout: 60_000 }
  );
  return summary;
}

export function describeSync(summary: BambuSyncSummary): string {
  const parts = [`${summary.created} neu`, `${summary.updated} aktualisiert`, `${summary.archived} archiviert`];
  if (summary.restored > 0) {
    parts.push(`${summary.restored} wiederhergestellt`);
  }
  if (summary.archiveBlocked) {
    parts.push("Archivieren übersprungen (ungewöhnlich viele fehlen in der Cloud)");
  }
  return parts.join(", ");
}
