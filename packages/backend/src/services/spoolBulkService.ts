import type { BulkCreateSpoolsInput } from "@filapilot/shared";
import { AppError } from "../lib/apiResult.js";
import { describeSpool, spoolSnapshot } from "../lib/auditSnapshots.js";
import { prisma } from "../prisma.js";
import { recordAudit, type AuditActor } from "./auditService.js";

const SPOOL_INCLUDE = { material: true, manufacturer: true, inventory: true } as const;

// Prueft alle Hersteller/Materialien der Anfrage vorab (existieren, Material passt zum Hersteller), damit eine
// fehlerhafte Zeile nichts anlegt - die Anlage selbst laeuft danach in EINER Transaktion (alles oder nichts).
async function assertCatalogEntriesValid(items: BulkCreateSpoolsInput["items"]): Promise<void> {
  const materialIds = [...new Set(items.map((item) => item.materialId))];
  const manufacturerIds = [...new Set(items.map((item) => item.manufacturerId))];
  const [materials, manufacturers] = await Promise.all([
    prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, manufacturerId: true } }),
    prisma.manufacturer.findMany({ where: { id: { in: manufacturerIds } }, select: { id: true } })
  ]);
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const knownManufacturers = new Set(manufacturers.map((manufacturer) => manufacturer.id));
  for (const item of items) {
    const material = materialById.get(item.materialId);
    if (!material) {
      throw new AppError("VALIDATION_ERROR", "Unbekanntes Material.");
    }
    if (!knownManufacturers.has(item.manufacturerId)) {
      throw new AppError("VALIDATION_ERROR", "Unbekannter Hersteller.");
    }
    if (material.manufacturerId && material.manufacturerId !== item.manufacturerId) {
      throw new AppError("VALIDATION_ERROR", "Das Material gehoert zu einem anderen Hersteller.");
    }
  }
}

// Legt alle Spulen der Anfrage im angegebenen Lager an (die Rolle EDITOR im Lager prueft die Route vorher).
// Jede Spule bekommt wie beim einzelnen Anlegen einen eigenen Protokoll-Eintrag.
export async function createSpoolsBulk(input: BulkCreateSpoolsInput, actor: AuditActor): Promise<{ ids: string[] }> {
  await assertCatalogEntriesValid(input.items);
  const openedAt = input.alreadyOpened ? new Date() : null;
  const created = await prisma.$transaction(
    async (tx) => {
      const spools = [];
      for (const item of input.items) {
        for (let index = 0; index < item.count; index += 1) {
          spools.push(
            await tx.spool.create({
              data: {
                inventoryId: input.inventoryId,
                manufacturerId: item.manufacturerId,
                materialId: item.materialId,
                colorName: item.colorName,
                colorHex: item.colorHex,
                initialWeightG: item.initialWeightG,
                remainingWeightG: item.initialWeightG,
                purchasePriceCents: item.purchasePriceCents,
                // Die Lieferform gibt es nur bei ungeoeffneten Spulen
                isRefill: input.alreadyOpened ? false : item.isRefill,
                location: input.location,
                openedAt
              },
              include: SPOOL_INCLUDE
            })
          );
        }
      }
      return spools;
    },
    { timeout: 30_000 }
  );
  for (const spool of created) {
    await recordAudit({
      actor,
      action: "CREATE",
      area: "SPOOL",
      entityId: spool.id,
      inventory: spool.inventory ? { id: spool.inventory.id, name: spool.inventory.name } : null,
      description: `${describeSpool(spool)} (Mehrfach-Anlage)`,
      after: spoolSnapshot(spool)
    });
  }
  return { ids: created.map((spool) => spool.id) };
}
