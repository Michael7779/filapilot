import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { ensureCatalog } from "../../src/services/catalogService.js";

describe("Katalog-Update 5: alte Cloud-Importe bekommen den richtigen Farbnamen", () => {
  let inventoryId = "";
  const ids: Record<string, string> = {};

  async function spool(key: string, over: { colorName: string; colorHex: string | null; bambuCloudId: string | null; materialId: string; manufacturerId: string }): Promise<void> {
    ids[key] = (
      await prisma.spool.create({
        data: { inventoryId, initialWeightG: 1000, remainingWeightG: 500, lastModifiedAt: new Date("2026-01-01"), ...over },
        select: { id: true }
      })
    ).id;
  }

  before(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.spool.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    const bambu = await prisma.manufacturer.create({ data: { name: "Bambu Lab" } });
    const material = await prisma.material.create({ data: { name: "PLA Basic", manufacturerId: bambu.id, printTempMinC: 190, printTempMaxC: 230, bedTempC: 45 } });
    inventoryId = (await prisma.inventory.create({ data: { name: "Farb-Lager" } })).id;
    const base = { materialId: material.id, manufacturerId: bambu.id };
    // altes RGB-Ergebnis fuer #61C680 war "Grau"; #00AE42 war "Grün" (jetzt Herstellername "Bambu-Grün")
    await spool("auto", { ...base, colorName: "Grau", colorHex: "#61C680", bambuCloudId: "c1" });
    await spool("vendor", { ...base, colorName: "Grün", colorHex: "#00AE42", bambuCloudId: "c2" });
    await spool("manuell", { ...base, colorName: "Mein Lieblingsgrau", colorHex: "#61C680", bambuCloudId: "c3" });
    await spool("ohneCloud", { ...base, colorName: "Grau", colorHex: "#61C680", bambuCloudId: null });
    await spool("richtig", { ...base, colorName: "Rot", colorHex: "#DE4343", bambuCloudId: "c4" });
    await prisma.settings.upsert({ where: { id: 1 }, update: { catalogVersion: 4 }, create: { id: 1, backupFolderPath: "backup-test", catalogVersion: 4 } });
  });

  after(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.spool.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.material.deleteMany();
    await prisma.manufacturer.deleteMany();
    await prisma.$disconnect();
  });

  it("benennt nur automatisch vergebene Namen von Cloud-Spulen um, protokolliert das und laesst alles andere und lastModifiedAt unberuehrt", async () => {
    await ensureCatalog();
    const names = Object.fromEntries((await prisma.spool.findMany()).map((entry) => [entry.id, entry]));
    assert.equal(names[ids.auto ?? ""]?.colorName, "Hellgrün");
    assert.equal(names[ids.vendor ?? ""]?.colorName, "Bambu-Grün");
    assert.equal(names[ids.manuell ?? ""]?.colorName, "Mein Lieblingsgrau");
    assert.equal(names[ids.ohneCloud ?? ""]?.colorName, "Grau");
    assert.equal(names[ids.richtig ?? ""]?.colorName, "Rot");
    assert.equal(names[ids.auto ?? ""]?.lastModifiedAt?.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(await prisma.auditLog.count({ where: { area: "SPOOL", action: "EVENT", description: { contains: "Farbname vom Import neu zugeordnet" } } }), 2);
  });

  it("laeuft nur einmal (zweiter Start aendert nichts mehr)", async () => {
    await prisma.spool.update({ where: { id: ids.auto ?? "" }, data: { colorName: "Grau" } });
    await ensureCatalog();
    assert.equal((await prisma.spool.findUnique({ where: { id: ids.auto ?? "" } }))?.colorName, "Grau");
  });
});
