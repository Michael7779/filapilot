import type { Prisma, WeightLogSource } from "@prisma/client";
import { prisma } from "../prisma.js";

type Db = Pick<Prisma.TransactionClient, "spoolWeightLog" | "spool">;

export interface WeightChange {
  spoolId: string;
  inventoryId: string | null;
  before: number;
  after: number;
  source: WeightLogSource;
}

// Quellen, die eine Spule tatsaechlich in Benutzung zeigen (Cloud-/Spoolman-Import setzen openedAt schon beim
// Anlegen bzw. betreffen Spulen, die per Definition bereits geoeffnet sind - siehe bambuImportService/spoolmanImportService).
const USAGE_SOURCES: ReadonlySet<WeightLogSource> = new Set(["PRINT", "MANUAL", "WEIGHED"]);

// Haelt eine Aenderung des Restgewichts mit Datum fest (Grundlage der Zeit-Statistik). Positiv = verbraucht, negativ = Gewicht
// erhoeht. Ohne echte Aenderung wird nichts geschrieben; das Anlegen einer Spule ist kein Verbrauch und wird nie erfasst.
// Nur der Server ruft das auf - es gibt keine Route, ueber die ein Client Eintraege setzen koennte.
// Markiert eine noch ungeoeffnete Spule bei der ersten echten Verbrauchs-/Wiege-/Bearbeitungs-Aenderung als geoeffnet
// und gibt den neu gesetzten Zeitpunkt zurueck (sonst null) - der Aufrufer haelt meist schon ein zuvor gelesenes
// Spulen-Objekt in der Hand, das dieses Feld sonst veraltet (openedAt: null) an den Client zurueckgeben wuerde.
export async function recordWeightChange(change: WeightChange, db: Db = prisma): Promise<Date | null> {
  if (change.before === change.after) {
    return null;
  }
  await db.spoolWeightLog.create({
    data: {
      spoolId: change.spoolId,
      inventoryId: change.inventoryId,
      deltaG: change.before - change.after,
      remainingG: change.after,
      source: change.source
    }
  });
  if (!USAGE_SOURCES.has(change.source)) {
    return null;
  }
  const openedAt = new Date();
  const result = await db.spool.updateMany({ where: { id: change.spoolId, openedAt: null }, data: { openedAt } });
  return result.count > 0 ? openedAt : null;
}
