import { AMS_SLOTS_PER_UNIT, EXTERNAL_AMS_SLOT_INDEX, MAX_AMS_UNITS } from "@filapilot/shared";

// Welche AMS-Einheiten angezeigt werden: die erste immer, weitere nur, wenn der Drucker sie meldet oder eine Spule dort zugeordnet ist.
export function visibleAmsUnits(slotIndexes: readonly number[]): number[] {
  const units = new Set<number>([0]);
  for (const slotIndex of slotIndexes) {
    if (
      slotIndex !== EXTERNAL_AMS_SLOT_INDEX &&
      slotIndex >= 0 &&
      slotIndex < AMS_SLOTS_PER_UNIT * MAX_AMS_UNITS
    ) {
      units.add(Math.floor(slotIndex / AMS_SLOTS_PER_UNIT));
    }
  }
  return [...units].sort((a, b) => a - b);
}
