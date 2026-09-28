import { EXTERNAL_AMS_SLOT_INDEX, type AmsSlotStatus, type AmsSlotView } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/apiResult.js";

function spoolLabel(spool: { colorName: string; material: { name: string } }): string {
  return `${spool.material.name} ${spool.colorName}`;
}

function slotOrder(slotIndex: number): number {
  return slotIndex === EXTERNAL_AMS_SLOT_INDEX ? 999 : slotIndex;
}

// Verbindet die Zuordnungen (welche Spule liegt in welchem Slot) mit dem, was der Drucker gerade meldet.
// Ein Slot ohne Live-Meldung (Drucker offline) erscheint trotzdem, wenn er zugeordnet ist.
export async function listAmsSlots(printerId: string, liveSlots: readonly AmsSlotStatus[]): Promise<AmsSlotView[]> {
  const assignments = await prisma.amsSlotAssignment.findMany({
    where: { printerId },
    include: { spool: { include: { material: true } } }
  });
  const bySlot = new Map(assignments.map((assignment) => [assignment.slotIndex, assignment]));
  const slotIndexes = new Set([...bySlot.keys(), ...liveSlots.map((slot) => slot.slotIndex)]);

  return [...slotIndexes]
    .sort((a, b) => slotOrder(a) - slotOrder(b))
    .map((slotIndex) => {
      const live = liveSlots.find((slot) => slot.slotIndex === slotIndex) ?? null;
      const assignment = bySlot.get(slotIndex) ?? null;
      return {
        slotIndex,
        reportedMaterial: live?.reportedMaterial ?? null,
        reportedColorHex: live?.reportedColorHex ?? null,
        remainingPercent: live?.remainingPercent ?? null,
        spoolId: assignment?.spoolId ?? null,
        spoolLabel: assignment?.spool ? spoolLabel(assignment.spool) : null
      };
    });
}

// Ordnet eine Spule einem Slot zu (oder loest die Zuordnung mit spoolId=null). Die Spule muss im selben Lager
// liegen wie der Drucker - sonst koennte eine fremde Spule Verbrauch aus einem anderen Lager gebucht bekommen.
export async function assignAmsSlot(
  printerId: string,
  printerInventoryId: string | null,
  slotIndex: number,
  spoolId: string | null
): Promise<void> {
  if (spoolId === null) {
    await prisma.amsSlotAssignment.deleteMany({ where: { printerId, slotIndex } });
    return;
  }
  const spool = await prisma.spool.findUnique({ where: { id: spoolId }, select: { inventoryId: true, archivedAt: true } });
  if (!spool) {
    throw new AppError("VALIDATION_ERROR", "Spule wurde nicht gefunden.");
  }
  if (spool.inventoryId !== printerInventoryId) {
    throw new AppError("VALIDATION_ERROR", "Die Spule muss im selben Lager wie der Drucker liegen.");
  }
  if (spool.archivedAt) {
    throw new AppError("VALIDATION_ERROR", "Eine archivierte Spule kann keinem Slot zugeordnet werden.");
  }
  await prisma.amsSlotAssignment.upsert({
    where: { printerId_slotIndex: { printerId, slotIndex } },
    create: { printerId, slotIndex, spoolId, assignedAt: new Date() },
    update: { spoolId, baselineRemainPercent: null, baselineRemainingG: null, assignedAt: new Date() }
  });
  // Eine Spule, die im AMS liegt, ist damit nachweislich in Benutzung - auch ohne bisherige Gewichtsaenderung.
  await prisma.spool.updateMany({ where: { id: spoolId, openedAt: null }, data: { openedAt: new Date() } });
}
