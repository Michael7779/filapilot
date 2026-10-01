import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findUnopenedMatch } from "../../src/services/unopenedSpoolMatch.js";

function fakeDb(spools: { id: string; colorHex: string | null }[]) {
  return {
    spool: {
      findMany: async () => spools
    }
  } as unknown as Parameters<typeof findUnopenedMatch>[0];
}

describe("findUnopenedMatch", () => {
  it("findet eine exakt gleiche Farbe weiterhin (Abstand 0)", async () => {
    const db = fakeDb([{ id: "s1", colorHex: "#FFFFFF" }]);
    const match = await findUnopenedMatch(db, "inv1", "m1", "mat1", "#FFFFFF");
    assert.deepEqual(match, { id: "s1" });
  });

  it("findet eine minimal abweichende Farbe (von Hand #FFFFFF, Cloud meldet #F5F5F0)", async () => {
    const db = fakeDb([{ id: "s1", colorHex: "#FFFFFF" }]);
    const match = await findUnopenedMatch(db, "inv1", "m1", "mat1", "#F5F5F0");
    assert.deepEqual(match, { id: "s1" });
  });

  it("lehnt eine deutlich andere Farbe ab (Weiss vs. Beige)", async () => {
    const db = fakeDb([{ id: "s1", colorHex: "#FFFFFF" }]);
    const match = await findUnopenedMatch(db, "inv1", "m1", "mat1", "#D8C3A0");
    assert.equal(match, null);
  });

  it("gibt bei mehreren Kandidaten innerhalb der Toleranz null zurueck (mehrdeutig)", async () => {
    const db = fakeDb([
      { id: "s1", colorHex: "#FFFFFF" },
      { id: "s2", colorHex: "#F5F5F0" }
    ]);
    const match = await findUnopenedMatch(db, "inv1", "m1", "mat1", "#FAFAFA");
    assert.equal(match, null);
  });

  it("sucht ohne bekannten Hex-Wert gar nicht erst", async () => {
    const db = fakeDb([{ id: "s1", colorHex: "#FFFFFF" }]);
    const match = await findUnopenedMatch(db, "inv1", "m1", "mat1", null);
    assert.equal(match, null);
  });
});
