import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AmsSlotView, PrinterLiveStatus } from "@filapilot/shared";
import { mergeLiveSlots } from "../../src/lib/mergeLiveSlots.js";

const loaded: AmsSlotView[] = [
  { slotIndex: 0, reportedMaterial: "PLA", reportedColorHex: "#FFFFFF", remainingPercent: 30, spoolId: "s1", spoolLabel: "PLA Weiss", auto: true }
];

function status(amsSlots: PrinterLiveStatus["amsSlots"], connected = true): PrinterLiveStatus {
  return {
    printerId: "p",
    connected,
    printing: false,
    printState: "idle",
    currentJobName: null,
    progressPercent: null,
    remainingSeconds: null,
    amsSlots
  };
}

describe("mergeLiveSlots - Live-Angaben des Druckers ueber die geladenen Faecher legen", () => {
  it("uebernimmt neuen Fuellstand, Material und Farbe und behaelt die Zuordnung", () => {
    const merged = mergeLiveSlots(loaded, status([{ slotIndex: 0, reportedMaterial: "PETG", reportedColorHex: "#000000", remainingPercent: 28 }]));
    assert.deepEqual(merged, [
      { slotIndex: 0, reportedMaterial: "PETG", reportedColorHex: "#000000", remainingPercent: 28, spoolId: "s1", spoolLabel: "PLA Weiss", auto: true }
    ]);
  });

  it("ergaenzt ein Fach, das beim Laden noch nicht gemeldet war", () => {
    const merged = mergeLiveSlots([], status([{ slotIndex: 5, reportedMaterial: "ABS", reportedColorHex: null, remainingPercent: null }]));
    assert.deepEqual(merged, [
      { slotIndex: 5, reportedMaterial: "ABS", reportedColorHex: null, remainingPercent: null, spoolId: null, spoolLabel: null }
    ]);
  });

  it("zeigt nach Verbindungsverlust keine alten Messwerte mehr", () => {
    const [slot] = mergeLiveSlots(loaded, status([], false));
    assert.equal(slot?.remainingPercent, null);
    assert.equal(slot?.reportedMaterial, null);
    assert.equal(slot?.spoolId, "s1");
  });

  it("laesst die geladenen Angaben stehen, solange es keinen Live-Status gibt", () => {
    assert.deepEqual(mergeLiveSlots(loaded, undefined), loaded);
  });
});
