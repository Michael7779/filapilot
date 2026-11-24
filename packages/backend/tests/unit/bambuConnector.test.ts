import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBambuReport } from "../../src/services/bambuConnector.js";

describe("parseBambuReport", () => {
  it("parst einen laufenden Druckauftrag korrekt", () => {
    const raw = {
      print: {
        gcode_state: "RUNNING",
        subtask_name: "Gehaeuse_Deckel_v3",
        mc_percent: 67,
        mc_remaining_time: 102
      }
    };

    const status = parseBambuReport("printer-1", raw);

    assert.ok(status);
    assert.equal(status.printing, true);
    assert.equal(status.currentJobName, "Gehaeuse_Deckel_v3");
    assert.equal(status.progressPercent, 67);
    assert.equal(status.remainingSeconds, 102 * 60);
  });

  it("gibt null zurueck bei unbekanntem Payload-Format", () => {
    const status = parseBambuReport("printer-1", { foo: "bar" });
    assert.equal(status, null);
  });

  it("erkennt einen nicht druckenden Zustand", () => {
    const raw = { print: { gcode_state: "IDLE" } };
    const status = parseBambuReport("printer-1", raw);
    assert.ok(status);
    assert.equal(status.printing, false);
    assert.equal(status.printState, "idle");
  });

  it("erkennt fertig/fehlgeschlagen als eigenen Status (nicht mehr 'printing')", () => {
    assert.equal(parseBambuReport("p", { print: { gcode_state: "FINISH" } })?.printState, "finished");
    assert.equal(parseBambuReport("p", { print: { gcode_state: "FAILED" } })?.printState, "failed");
    assert.equal(parseBambuReport("p", { print: { gcode_state: "PAUSE" } })?.printState, "paused");
    assert.equal(parseBambuReport("p", { print: { gcode_state: "PAUSE" } })?.printing, false);
    assert.equal(parseBambuReport("p", { print: { gcode_state: "irgendwas" } })?.printState, "unknown");
  });

  it("liest AMS-Kammern (Farbe/Material/Fuellstand) und die externe Spule (vt_tray)", () => {
    const raw = {
      print: {
        gcode_state: "RUNNING",
        ams: {
          ams: [
            {
              tray: [
                { id: "0", tray_type: "PLA", tray_color: "FFFFFFFF", remain: 80 },
                { id: "1", tray_type: "PETG", tray_color: "D14343FF", remain: -1 },
                { id: "2" },
                { id: "3", tray_type: "", tray_color: "000000FF", remain: 12 }
              ]
            }
          ]
        },
        vt_tray: { tray_type: "TPU", tray_color: "0B2A4AFF", remain: 45 }
      }
    };
    const status = parseBambuReport("printer-1", raw);
    assert.ok(status);
    assert.deepEqual(status.amsSlots, [
      { slotIndex: 0, reportedMaterial: "PLA", reportedColorHex: "#FFFFFF", remainingPercent: 80 },
      { slotIndex: 1, reportedMaterial: "PETG", reportedColorHex: "#D14343", remainingPercent: null },
      { slotIndex: 2, reportedMaterial: null, reportedColorHex: null, remainingPercent: null },
      { slotIndex: 3, reportedMaterial: null, reportedColorHex: "#000000", remainingPercent: 12 },
      { slotIndex: 254, reportedMaterial: "TPU", reportedColorHex: "#0B2A4A", remainingPercent: 45 }
    ]);
  });

  it("unterscheidet mehrere AMS-Einheiten: Slot-Index = Einheit * 4 + Kammer (erste Einheit bleibt 0-3)", () => {
    const raw = {
      print: {
        ams: {
          ams: [
            { id: "0", tray: [{ id: "0", tray_type: "PLA", tray_color: "FFFFFFFF", remain: 80 }] },
            {
              id: "1",
              tray: [
                { id: "0", tray_type: "PETG", tray_color: "D14343FF", remain: 50 },
                { id: "3", tray_type: "ABS", tray_color: "000000FF", remain: 10 }
              ]
            }
          ]
        }
      }
    };
    assert.deepEqual(parseBambuReport("p", raw)?.amsSlots, [
      { slotIndex: 0, reportedMaterial: "PLA", reportedColorHex: "#FFFFFF", remainingPercent: 80 },
      { slotIndex: 4, reportedMaterial: "PETG", reportedColorHex: "#D14343", remainingPercent: 50 },
      { slotIndex: 7, reportedMaterial: "ABS", reportedColorHex: "#000000", remainingPercent: 10 }
    ]);
  });

  it("nimmt die Position in der Liste, wenn eine Einheit keine id meldet, und ignoriert Einheiten ausserhalb 0-3", () => {
    const raw = {
      print: {
        ams: {
          ams: [
            { tray: [{ id: "1", tray_type: "PLA" }] },
            { tray: [{ id: "0", tray_type: "PETG" }] },
            { id: "128", tray: [{ id: "0", tray_type: "TPU" }] },
            { id: "kaputt", tray: [{ id: "0", tray_type: "ABS" }] }
          ]
        }
      }
    };
    assert.deepEqual(
      parseBambuReport("p", raw)?.amsSlots.map((slot) => [slot.slotIndex, slot.reportedMaterial]),
      [
        [1, "PLA"],
        [4, "PETG"]
      ]
    );
  });

  it("liefert eine leere AMS-Liste ohne AMS/vt_tray im Report (kein Absturz)", () => {
    const status = parseBambuReport("printer-1", { print: { gcode_state: "IDLE" } });
    assert.deepEqual(status?.amsSlots, []);
  });
});
