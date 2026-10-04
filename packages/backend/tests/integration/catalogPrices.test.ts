import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { ensureCatalog } from "../../src/services/catalogService.js";
import { CATALOG_MATERIALS } from "../../src/services/catalogData.js";

describe("Katalog: Bambu-Lab-Richtpreise", () => {
  let bambuId = "";

  before(async () => {
    await prisma.spool.deleteMany();
    await prisma.wishlistItem.deleteMany();
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    bambuId = (await prisma.manufacturer.create({ data: { name: "Bambu Lab" } })).id;
    await prisma.settings.upsert({
      where: { id: 1 },
      update: { catalogVersion: 3 },
      create: { id: 1, backupFolderPath: "backup-test", catalogVersion: 3 }
    });
  });

  after(async () => {
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    await prisma.$disconnect();
  });

  it("traegt Preise bei bestehenden Materialien ohne Preis nach, ueberschreibt aber nie einen gepflegten Preis und legt fehlende Materialien mit Preis an", async () => {
    const base = { manufacturerId: bambuId, printTempMinC: 190, printTempMaxC: 230, bedTempC: 45 };
    await prisma.material.create({ data: { ...base, name: "PLA Basic" } });
    await prisma.material.create({ data: { ...base, name: "PLA Matte", priceRefillCents: 999 } });

    await ensureCatalog();

    const byName = new Map((await prisma.material.findMany({ where: { manufacturerId: bambuId } })).map((material) => [material.name, material]));
    assert.deepEqual([byName.get("PLA Basic")?.priceRefillCents, byName.get("PLA Basic")?.priceWithSpoolCents], [1019, 1199]);
    assert.deepEqual([byName.get("PLA Matte")?.priceRefillCents, byName.get("PLA Matte")?.priceWithSpoolCents], [999, null]);
    assert.deepEqual([byName.get("PETG Basic")?.priceRefillCents, byName.get("PETG Basic")?.priceWithSpoolCents], [959, 1139]);
    // Material ohne einzelne Nachfuellung (nur mit Spule erhaeltlich)
    assert.deepEqual([byName.get("ASA")?.priceRefillCents, byName.get("ASA")?.priceWithSpoolCents], [null, 2499]);
  });

  it("die Vorlage enthaelt nur gueltige Preise (ganze Cent, nicht negativ)", () => {
    for (const entry of CATALOG_MATERIALS) {
      for (const price of [entry.priceRefillCents, entry.priceWithSpoolCents]) {
        assert.ok(price === null || (Number.isInteger(price) && price >= 0), `${entry.name}: ${String(price)}`);
      }
    }
  });
});
