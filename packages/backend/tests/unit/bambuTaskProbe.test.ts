import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { setBambuCloudClientForTests, type BambuCloudClient } from "../../src/services/bambuCloudClient.js";
import { describeTasks, probeTaskHistory } from "../../src/services/bambuTaskProbe.js";

const task = {
  id: 987654321,
  title: "Geheimer Druckname",
  deviceId: "SERIAL-123",
  cover: "https://example.test/bild.png?sig=geheim",
  weight: 23.5,
  status: 2,
  amsDetailMapping: [{ ams: 3, slotId: 1, weight: "23.5", filamentType: "PETG", targetColor: "000000FF" }]
};

describe("Bambu-Druckhistorie: Diagnose ohne Inhalte", () => {
  after(() => setBambuCloudClientForTests(null));

  it("nennt Feldnamen, Gramm, Fach und Status und ob der Drucker bekannt ist", () => {
    const result = describeTasks([task], ["serial-123"]);
    assert.equal(result.count, 1);
    assert.ok(result.fields.includes("title") && result.fields.includes("weight"));
    assert.deepEqual(result.listFields.amsDetailMapping, ["ams", "filamentType", "slotId", "targetColor", "weight"]);
    assert.deepEqual(result.samples, [
      { knownPrinter: true, values: { status: 2, weight: 23.5 }, lists: { amsDetailMapping: [{ ams: 3, slotId: 1, weight: 23.5 }] } }
    ]);
  });

  it("gibt keine Texte, Kennungen, Seriennummern oder Links weiter", () => {
    const text = JSON.stringify(describeTasks([task], ["serial-123"]));
    for (const secret of ["Geheimer", "SERIAL", "https", "geheim", "987654321", "PETG", "000000FF"]) {
      assert.ok(!text.includes(secret), secret);
    }
  });

  it("uebergeht Unsinn und seltsame Feldnamen", () => {
    const result = describeTasks([null, "text", { "ein name mit leerzeichen": 1, weight: "viel" }], []);
    assert.deepEqual(result.fields, ["weight"]);
    assert.deepEqual(result.samples.at(-1), { knownPrinter: false, values: {}, lists: {} });
  });

  it("wirft nie, auch wenn die Abfrage scheitert", async () => {
    setBambuCloudClientForTests({ listTasks: () => Promise.reject(new Error("kaputt")) } as unknown as BambuCloudClient);
    await probeTaskHistory("global", "TOKEN", []);
  });
});
