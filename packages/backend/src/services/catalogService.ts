import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { SYSTEM_ACTOR, recordAudit } from "./auditService.js";
import { renameLegacyImportColors } from "./spoolColorRenameService.js";
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
  // Ebenso die Richtpreise (0.26.0): sind BEIDE Preise leer, werden sie aus der Vorlage nachgetragen; ein schon
  // gepflegter Preis wird nie ueberschrieben.
  const existing = await prisma.material.findMany({
    select: { id: true, name: true, manufacturerId: true, densityGCm3: true, priceRefillCents: true, priceWithSpoolCents: true }
  });
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
        densityGCm3: entry.densityGCm3,
        priceRefillCents: entry.priceRefillCents,
        priceWithSpoolCents: entry.priceWithSpoolCents
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
  const pricesToBackfill = existing.flatMap((material) => {
    const template = catalogByKey.get(`${material.manufacturerId ?? ""}|${material.name}`);
    const hasNoPrice = material.priceRefillCents === null && material.priceWithSpoolCents === null;
    return template && hasNoPrice && (template.priceRefillCents !== null || template.priceWithSpoolCents !== null)
      ? [{ id: material.id, priceRefillCents: template.priceRefillCents, priceWithSpoolCents: template.priceWithSpoolCents }]
      : [];
  });
  if (pricesToBackfill.length > 0) {
    await Promise.all(
      pricesToBackfill.map(({ id, ...prices }) => prisma.material.update({ where: { id }, data: prices }))
    );
    await recordAudit({
      actor: SYSTEM_ACTOR,
      action: "EVENT",
      area: "MATERIAL",
      description: `Richtpreise aus Vorlage nachgetragen: ${pricesToBackfill.length} Materialien ergaenzt`
    });
  }
  // Einmalig (0.28.0): aeltere Cloud-Importe bekommen den korrekten Farbnamen (nur automatisch vergebene Namen).
  if (settings.catalogVersion < 5) {
    await renameLegacyImportColors();
  }
  await prisma.settings.update({ where: { id: 1 }, data: { catalogVersion: CATALOG_VERSION } });
}

export function ensureCatalog(): Promise<void> {
  running ??= seedCatalog().finally(() => {
    running = null;
  });
  return running;
}
