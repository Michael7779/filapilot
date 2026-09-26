import type { Prisma, WeightLogSource } from "@prisma/client";
import { prisma } from "../prisma.js";

type Db = Pick<Prisma.TransactionClient, "spoolWeightLog">;

export interface WeightChange {
  spoolId: string;
  inventoryId: string | null;
  before: number;
  after: number;
  source: WeightLogSource;
}

// Haelt eine Aenderung des Restgewichts mit Datum fest (Grundlage der Zeit-Statistik). Positiv = verbraucht, negativ = Gewicht
// erhoeht. Ohne echte Aenderung wird nichts geschrieben; das Anlegen einer Spule ist kein Verbrauch und wird nie erfasst.
// Nur der Server ruft das auf - es gibt keine Route, ueber die ein Client Eintraege setzen koennte.
export async function recordWeightChange(change: WeightChange, db: Db = prisma): Promise<void> {
  if (change.before === change.after) {
    return;
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
}
