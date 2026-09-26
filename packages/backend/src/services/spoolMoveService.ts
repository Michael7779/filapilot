import { prisma } from "../prisma.js";
import { AppError } from "../lib/apiResult.js";

// Verschiebt alle Spulen (auch archivierte) samt Gewichtsverlauf in einer Transaktion in ein anderes Lager.
// Der Verlauf zieht mit um, damit die Statistik des Ziel-Lagers stimmt und die des Quell-Lagers nicht doppelt zaehlt.
export async function moveAllSpools(sourceId: string, targetId: string): Promise<number> {
  if (sourceId === targetId) {
    throw new AppError("VALIDATION_ERROR", "Quell- und Ziel-Lager muessen verschieden sein.");
  }
  return prisma.$transaction(async (tx) => {
    const moved = await tx.spool.updateMany({ where: { inventoryId: sourceId }, data: { inventoryId: targetId } });
    await tx.spoolWeightLog.updateMany({ where: { inventoryId: sourceId }, data: { inventoryId: targetId } });
    return moved.count;
  });
}
