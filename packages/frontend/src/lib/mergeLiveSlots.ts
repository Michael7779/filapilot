import type { AmsSlotView, PrinterLiveStatus } from "@filapilot/shared";

// Legt die Angaben aus dem Live-Status (Material, Farbe, Fuellstand) ueber die geladenen Faecher; die Zuordnung der Spulen
// bleibt, wie sie geladen wurde. Ohne Live-Status (noch keiner bekannt) bleibt alles unveraendert.
export function mergeLiveSlots(slots: AmsSlotView[], status: PrinterLiveStatus | undefined): AmsSlotView[] {
  if (!status) {
    return slots;
  }
  const live = new Map(status.amsSlots.map((slot) => [slot.slotIndex, slot]));
  const known = new Set(slots.map((slot) => slot.slotIndex));
  const updated = slots.map((slot) => ({
    ...slot,
    reportedMaterial: live.get(slot.slotIndex)?.reportedMaterial ?? null,
    reportedColorHex: live.get(slot.slotIndex)?.reportedColorHex ?? null,
    remainingPercent: live.get(slot.slotIndex)?.remainingPercent ?? null
  }));
  const added = status.amsSlots
    .filter((slot) => !known.has(slot.slotIndex))
    .map((slot) => ({ ...slot, spoolId: null, spoolLabel: null }));
  return [...updated, ...added];
}
