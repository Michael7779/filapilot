import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bucketKey, defaultRange, isValidTimeZone, listBuckets, STATS_MAX_BUCKETS } from "@filapilot/shared";

const BERLIN = "Europe/Berlin";

describe("Statistik: Zeitabschnitte", () => {
  it("bildet Tages-, Wochen-, Monats- und Jahresschluessel", () => {
    const date = new Date("2026-09-26T10:00:00Z"); // Samstag
    assert.equal(bucketKey(date, "day", "UTC"), "2026-09-26");
    assert.equal(bucketKey(date, "week", "UTC"), "2026-09-21");
    assert.equal(bucketKey(date, "month", "UTC"), "2026-09");
    assert.equal(bucketKey(date, "year", "UTC"), "2026");
  });

  it("rechnet in der Zeitzone des Benutzers: kurz nach Mitternacht in Berlin ist schon der naechste Tag", () => {
    const lateEvening = new Date("2026-09-26T22:30:00Z"); // 00:30 am 27.09. in Berlin (UTC+2)
    assert.equal(bucketKey(lateEvening, "day", "UTC"), "2026-09-26");
    assert.equal(bucketKey(lateEvening, "day", BERLIN), "2026-09-27");
    // Sonntag gehoert noch zur Woche, die am Montag davor beginnt
    assert.equal(bucketKey(lateEvening, "week", BERLIN), "2026-09-21");
  });

  it("Wochen beginnen am Montag, auch ueber den Jahreswechsel", () => {
    assert.equal(bucketKey(new Date("2026-09-21T12:00:00Z"), "week", "UTC"), "2026-09-21"); // Montag
    assert.equal(bucketKey(new Date("2026-09-27T12:00:00Z"), "week", "UTC"), "2026-09-21"); // Sonntag
    assert.equal(bucketKey(new Date("2026-01-01T12:00:00Z"), "week", "UTC"), "2025-12-29");
    assert.equal(bucketKey(new Date("2025-12-31T23:30:00Z"), "year", BERLIN), "2026");
    assert.equal(bucketKey(new Date("2025-12-31T23:30:00Z"), "year", "UTC"), "2025");
  });

  it("listet Zeitabschnitte lueckenlos, auch ueber Monats-, Jahres- und Zeitumstellungs-Grenzen", () => {
    assert.deepEqual(listBuckets(new Date("2026-09-29T12:00:00Z"), new Date("2026-10-02T12:00:00Z"), "day", "UTC"), [
      "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"
    ]);
    assert.deepEqual(listBuckets(new Date("2026-03-27T12:00:00Z"), new Date("2026-03-31T12:00:00Z"), "day", BERLIN), [
      "2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"
    ]);
    assert.deepEqual(listBuckets(new Date("2025-11-15T00:00:00Z"), new Date("2026-02-10T00:00:00Z"), "month", "UTC"), [
      "2025-11", "2025-12", "2026-01", "2026-02"
    ]);
    assert.deepEqual(listBuckets(new Date("2025-12-20T00:00:00Z"), new Date("2026-01-12T00:00:00Z"), "week", "UTC"), [
      "2025-12-15", "2025-12-22", "2025-12-29", "2026-01-05", "2026-01-12"
    ]);
    assert.deepEqual(listBuckets(new Date("2023-05-01T00:00:00Z"), new Date("2026-05-01T00:00:00Z"), "year", "UTC"), ["2023", "2024", "2025", "2026"]);
  });

  it("begrenzt die Anzahl der Abschnitte", () => {
    const keys = listBuckets(new Date("2000-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"), "day", "UTC");
    assert.equal(keys.length, STATS_MAX_BUCKETS + 1);
  });

  it("liefert Standard-Zeitraeume mit der erwarteten Anzahl Abschnitte", () => {
    const now = new Date("2026-09-26T10:00:00Z");
    const count = (period: "day" | "week" | "month" | "year"): number => {
      const range = defaultRange(period, now);
      return listBuckets(range.from, range.to, period, "UTC").length;
    };
    assert.equal(count("day"), 30);
    assert.equal(count("week"), 12);
    assert.ok(count("month") >= 12 && count("month") <= 13);
    assert.ok(count("year") >= 5 && count("year") <= 6);
  });

  it("prueft Zeitzonen", () => {
    assert.equal(isValidTimeZone("Europe/Berlin"), true);
    assert.equal(isValidTimeZone("UTC"), true);
    assert.equal(isValidTimeZone("Mars/Olympus"), false);
  });
});
