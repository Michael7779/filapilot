import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { SYSTEM_ACTOR, recordAudit } from "./auditService.js";
import { CATALOG_MANUFACTURERS, CATALOG_MATERIALS, CATALOG_VERSION } from "./catalogData.js";

let running: Promise<void> | null = null;

async function seedCatalog(): Promise<void> {
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, backupFolderPath: env.BACKUP_FOLDER_PATH }
  });
  const manufacturerCount = await prisma.manufacturer.count();
  if (settings.catalogVersion >= CATALOG_VERSION && manufacturerCount > 0) {
    return;
  }

  await prisma.manufacturer.createMany({
    data: CATALOG_MANUFACTURERS.map((name) => ({ name })),
    skipDuplicates: true
  });
  const manufacturers = await prisma.manufacturer.findMany();
  const idByName = new Map(manufacturers.map((manufacturer) => [manufacturer.name, manufacturer.id]));

  // Nur nachtragen, was fehlt - bestehende (auch vom Admin geaenderte) Eintraege bleiben unberuehrt. Ausnahme:
  // die Dichte ist ein neues Feld (0.18.0) - ein leerer Wert kann nie eine bewusste Admin-Aenderung gewesen sein,
  // deshalb wird er bei einem Namens-/Hersteller-Treffer mit der Vorlage nachgetragen (nur wenn noch leer).
  // Beim ersten Einspielen einer neuen Version fehlende Hersteller-Eintraege ergaenzen.
  const existing = await prisma.material.findMany({ select: { id: true, name: true, manufacturerId: true, densityGCm3: true } });
  const known = new Set(existing.map((material) => `${material.manufacturerId ?? ""}|${material.name}`));
  const catalogByKey = new Map(
    CATALOG_MATERIALS.map((entry) => [`${(entry.manufacturer ? idByName.get(entry.manufacturer) : null) ?? ""}|${entry.name}`, entry])
  );
  const missing = CATALOG_MATERIALS.flatMap((entry) => {
    const manufacturerId = entry.manufacturer ? idByName.get(entry.manufacturer) : null;
    if (manufacturerId === undefined || known.has(`${manufacturerId ?? ""}|${entry.name}`)) {
      return [];
    }
    return [
      {
        name: entry.name,
        manufacturerId: manufacturerId ?? null,
        printTempMinC: entry.minC,
        printTempMaxC: entry.maxC,
        bedTempC: entry.bedC,
        densityGCm3: entry.densityGCm3
      }
    ];
  });
  if (missing.length > 0) {
    await prisma.material.createMany({ data: missing, skipDuplicates: true });
    await recordAudit({
      actor: SYSTEM_ACTOR,
      action: "EVENT",
      area: "MATERIAL",
      description: `Mitgelieferte Vorlagen eingespielt: ${missing.length} Materialien ergaenzt`
    });
  }

  const toBackfill = existing.filter((material) => {
    if (material.densityGCm3 !== null) {
      return false;
    }
    const template = catalogByKey.get(`${material.manufacturerId ?? ""}|${material.name}`);
    return template?.densityGCm3 != null;
  });
  if (toBackfill.length > 0) {
    await Promise.all(
      toBackfill.map((material) => {
        const density = catalogByKey.get(`${material.manufacturerId ?? ""}|${material.name}`)?.densityGCm3 ?? null;
        return prisma.material.update({ where: { id: material.id }, data: { densityGCm3: density } });
      })
    );
    await recordAudit({
      actor: SYSTEM_ACTOR,
      action: "EVENT",
      area: "MATERIAL",
      description: `Dichte aus Vorlage nachgetragen: ${toBackfill.length} Materialien ergaenzt`
    });
  }
  await prisma.settings.update({ where: { id: 1 }, data: { catalogVersion: CATALOG_VERSION } });
}

export function ensureCatalog(): Promise<void> {
  running ??= seedCatalog().finally(() => {
    running = null;
  });
  return running;
}
