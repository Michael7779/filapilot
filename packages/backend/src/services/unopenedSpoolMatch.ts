import type { Prisma } from "@prisma/client";
import { colorDistanceSquared } from "@filapilot/shared";

type Db = Pick<Prisma.TransactionClient, "spool">;

// Zwei Farben gelten als "dieselbe" Spule, wenn ihr RGB-Abstand hier drunter bleibt (Quadrat, siehe
// colorDistanceSquared - kein sqrt noetig). Schwellwert so gewaehlt, dass minimale Abweichungen zwischen dem
// von Hand eingetragenen Hex-Wert und dem von der Bambu-Cloud/AMS gemeldeten (z.B. #FFFFFF vs. #F5F5F0 fuer
// dasselbe "Weiss") noch zusammenfallen, aber deutlich unterschiedliche benannte Farben (z.B. Weiss vs. Beige,
// Abstand > 9000) sicher nicht. Entspricht einem euklidischen Abstand von ca. 30.
const MAX_COLOR_DISTANCE_SQUARED = 900;

// Findet EINDEUTIG (genau ein Treffer, sonst null) eine noch ungeoeffnete, noch nicht extern verknuepfte Spule mit
// gleichem Hersteller/Material und einer sehr aehnlichen Farbe im selben Lager - Grundlage fuer "verknuepfen statt
// neu anlegen" bei Cloud-/Spoolman-Import, damit eine schon im Bestand liegende neue Spule nicht doppelt gezaehlt
// wird. Ohne bekannte Farbe (colorHex null) wird nicht gesucht - zu unsicher, um automatisch etwas vorzuschlagen.
// Mehrere Kandidaten innerhalb der Toleranz gelten als mehrdeutig (null) statt irgendeinen zu raten.
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
      colorHex: { not: null },
      openedAt: null,
      archivedAt: null,
      bambuCloudId: null,
      spoolmanId: null
    },
    select: { id: true, colorHex: true },
    take: 50
  });
  const close = candidates.filter(
    (candidate) => candidate.colorHex && colorDistanceSquared(colorHex, candidate.colorHex) <= MAX_COLOR_DISTANCE_SQUARED
  );
  const [only] = close;
  return close.length === 1 && only ? { id: only.id } : null;
}
