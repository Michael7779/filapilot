import { prisma } from "../prisma.js";
import { env } from "../env.js";
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

  // Nur nachtragen, was fehlt - bestehende (auch vom Admin geaenderte) Eintraege bleiben unberuehrt.
  // Beim ersten Einspielen einer neuen Version fehlende Hersteller-Eintraege ergaenzen.
  const existing = await prisma.material.findMany({ select: { name: true, manufacturerId: true } });
  const known = new Set(existing.map((material) => `${material.manufacturerId ?? ""}|${material.name}`));
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
        bedTempC: entry.bedC
      }
    ];
  });
  if (missing.length > 0) {
    await prisma.material.createMany({ data: missing, skipDuplicates: true });
  }
  await prisma.settings.update({ where: { id: 1 }, data: { catalogVersion: CATALOG_VERSION } });
}

export function ensureCatalog(): Promise<void> {
  running ??= seedCatalog().finally(() => {
    running = null;
  });
  return running;
}
