import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTaskHistory } from "../../src/services/printHistoryParser.js";

const task = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 4711,
  status: 2,
  deviceId: "serial-1",
  title: "Platte 1",
  designTitle: "Batteriefachhalter",
  startTime: "2026-11-27T16:06:00Z",
  endTime: "2026-11-27T16:53:00Z",
  amsDetailMapping: [{ ams: 0, amsId: 0, slotId: 0, weight: 31.36, filamentType: "PLA", targetColor: "FFFFFFFF" }],
  ...over
});

describe("Druckhistorie der Bambu-Cloud lesen", () => {
  it("liest einen fertigen Druck mit Fach, Gramm, Material und Farbe", () => {
    const parsed = parseTaskHistory([task()]);
    assert.deepEqual(parsed, {
      finished: [
        {
          id: "4711",
          serialNumber: "SERIAL-1",
          name: "Batteriefachhalter",
          startedAt: new Date("2026-11-27T16:06:00Z"),
          finishedAt: new Date("2026-11-27T16:53:00Z"),
          filaments: [{ slotIndex: 0, weightG: 31, material: "PLA", colorHex: "#FFFFFF" }]
        }
      ],
      notFinished: 0,
      unreadable: 0
    });
  });

  it("zaehlt laufende, haengende und abgebrochene Auftraege nur als nicht fertig", () => {
    const parsed = parseTaskHistory([task({ status: 1 }), task({ status: 3 })]);
    assert.deepEqual([parsed.finished.length, parsed.notFinished, parsed.unreadable], [0, 2, 0]);
  });

  it("summiert zwei Filamente aus demselben Fach, rechnet die externe Spule um und nimmt das Zielmaterial", () => {
    const [parsed] = parseTaskHistory([
      task({
        amsDetailMapping: [
          { amsId: 1, slotId: 2, weight: 10.4, filamentType: "PLA", targetFilamentType: "PETG" },
          { amsId: "1", slotId: "2", weight: "5.3", filamentType: "PLA", targetFilamentType: "PETG" },
          { amsId: 255, slotId: 255, weight: 7, filamentType: "TPU", targetFilamentType: "" }
        ]
      })
    ]).finished;
    assert.deepEqual(parsed?.filaments, [
      { slotIndex: 6, weightG: 16, material: "PETG", colorHex: null },
      { slotIndex: 254, weightG: 7, material: "TPU", colorHex: null }
    ]);
  });

  it("versteht Zeiten als Sekunden oder Millisekunden und nimmt ohne Ende den Beginn", () => {
    const seconds = Date.parse("2026-11-27T16:53:00Z") / 1000;
    const [first, second] = parseTaskHistory([task({ endTime: seconds }), task({ endTime: undefined, startTime: seconds * 1000 })]).finished;
    assert.equal(first?.finishedAt.toISOString(), "2026-11-27T16:53:00.000Z");
    assert.equal(second?.finishedAt.toISOString(), "2026-11-27T16:53:00.000Z");
  });

  it("kommt mit fehlenden Feldern aus: nur Ende, und externe Spule ohne Kammer-Angabe", () => {
    const entry = task({ amsDetailMapping: [{ amsId: 254, weight: 12 }] });
    delete entry.startTime;
    delete entry.title;
    delete entry.designTitle;
    const [parsed] = parseTaskHistory([entry]).finished;
    assert.equal(parsed?.startedAt.toISOString(), "2026-11-27T16:53:00.000Z");
    assert.deepEqual(parsed?.filaments, [{ slotIndex: 254, weightG: 12, material: "", colorHex: null }]);
  });

  it("verwirft unbrauchbare Eintraege und Mengen, statt zu raten", () => {
    const parsed = parseTaskHistory([
      null,
      "x",
      task({ id: undefined }),
      task({ deviceId: 5 }),
      task({ endTime: "gestern", startTime: undefined }),
      task({ amsDetailMapping: [] }),
      task({ amsDetailMapping: [{ amsId: 0, slotId: 9, weight: 5 }, { amsId: 0, slotId: 1, weight: -3 }, { amsId: 0, slotId: 2, weight: 0.2 }] })
    ]);
    assert.equal(parsed.finished.length, 0);
    assert.equal(parsed.unreadable, 7);
  });

  it("kuerzt lange Namen und faellt auf den Plattentitel bzw. einen Standardnamen zurueck", () => {
    const [long, plate, none] = parseTaskHistory([
      task({ designTitle: "x".repeat(500) }),
      task({ designTitle: "  " }),
      task({ designTitle: undefined, title: undefined })
    ]).finished;
    assert.equal(long?.name.length, 120);
    assert.equal(plate?.name, "Platte 1");
    assert.equal(none?.name, "Druckauftrag");
  });
});
