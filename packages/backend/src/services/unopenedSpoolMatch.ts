import type { Prisma } from "@prisma/client";

type Db = Pick<Prisma.TransactionClient, "spool">;

// Findet EINDEUTIG (genau ein Treffer, sonst null) eine noch ungeoeffnete, noch nicht extern verknuepfte Spule mit
// exakt gleichem Hersteller/Material/Farbe im selben Lager - Grundlage fuer "verknuepfen statt neu anlegen" bei
// Cloud-/Spoolman-Import, damit eine schon im Bestand liegende neue Spule nicht doppelt gezaehlt wird. Ohne
// bekannte Farbe (colorHex null) wird nicht gesucht - zu unsicher, um automatisch etwas vorzuschlagen.
export async function findUnopenedMatch(
  db: Db,
  inventoryId: string,
  manufacturerId: string,
  materialId: string,
  colorHex: string | null
): Promise<{ id: string } | null> {
  if (!colorHex) {
    return null;
  }
  const candidates = await db.spool.findMany({
    where: {
      inventoryId,
      manufacturerId,
      materialId,
      colorHex,
      openedAt: null,
      archivedAt: null,
      bambuCloudId: null,
      spoolmanId: null
    },
    select: { id: true },
    take: 2
  });
  const [only] = candidates;
  return candidates.length === 1 && only ? only : null;
}
