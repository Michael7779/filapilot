import { AMS_SLOTS_PER_UNIT, EXTERNAL_AMS_SLOT_INDEX, MAX_AMS_UNITS } from "@filapilot/shared";

// Umrechnung der Fach-Angaben der Bambu-Cloud (AMS-Einheit + Kammer) in den Slot-Index von FilaPilot.

// Cloud-Kennungen fuer die externe Spule (statt einer AMS-Einheit).
const EXTERNAL_UNIT_IDS = new Set([254, 255]);

export function toSlotNumber(value: unknown): number | null {
  const text = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  return /^\d{1,3}$/.test(text) ? Number(text) : null;
}

export function cloudSlotIndex(amsId: unknown, slotId: unknown): number | null {
  const unit = toSlotNumber(amsId);
  if (unit !== null && EXTERNAL_UNIT_IDS.has(unit)) {
    return EXTERNAL_AMS_SLOT_INDEX;
  }
  const tray = toSlotNumber(slotId);
  if (unit === null || tray === null || unit >= MAX_AMS_UNITS || tray >= AMS_SLOTS_PER_UNIT) {
    return null;
  }
  return unit * AMS_SLOTS_PER_UNIT + tray;
}
