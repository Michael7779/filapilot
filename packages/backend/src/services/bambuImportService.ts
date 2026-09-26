import {
  bambuSpoolSchema,
  nearestColorName,
  normalizeHexColor,
  type BambuImportInput,
  type BambuImportSummary,
  type BambuPreview,
  type BambuPreviewRow,
  type BambuSpool
} from "@filapilot/shared";
import type { Prisma } from "@prisma/client";
import { AppError } from "../lib/apiResult.js";
import { recordWeightChange } from "./spoolWeightLog.js";
import { prisma } from "../prisma.js";
import { BambuCloudError } from "./bambuCloudClient.js";
import type { ImportSession } from "./bambuImportSessions.js";

const DEFAULT_TOTAL_G = 1000;
const DEFAULT_TEMPS = { min: 190, max: 230, bed: 60 } as const;
const UNKNOWN_VENDOR = "Unbekannt";

export interface MappedSpool {
  cloudId: string;
  vendor: string;
  materialName: string;
  typeName: string;
  colorHex: string | null;
  colorName: string;
  remainingG: number;
  totalG: number;
  status: number | null;
  inPrinter: boolean;
  deviceName: string | null;
}

// Uebersetzt Fehler der Cloud in verstaendliche Meldungen - nie mit Text aus der Antwort der Cloud.
function withDetail(message: string, err: BambuCloudError): string {
  if (!err.detail) {
    return message;
  }
  const status = err.detail.status ? `, HTTP ${err.detail.status}` : "";
  return `${message} (Schritt: ${err.detail.step}${status})`;
}

export function toAppError(err: unknown): AppError {
  if (!(err instanceof BambuCloudError)) {
    throw err;
  }
  switch (err.kind) {
    case "credentials":
      return new AppError("VALIDATION_ERROR", withDetail("Die Anmeldung bei Bambu ist fehlgeschlagen. Bitte E-Mail, Passwort bzw. Code prüfen.", err));
    case "unauthorized":
      return new AppError("VALIDATION_ERROR", withDetail("Bambu hat den Zugang abgelehnt (abgelaufen?). Bitte neu anmelden.", err));
    case "blocked":
      return new AppError(
        "UPSTREAM_ERROR",
        withDetail("Bambu blockiert den automatischen Zugriff (Bot-Schutz). Nutze stattdessen den Weg über die JSON-Datei.", err)
      );
    case "network":
      return new AppError("UPSTREAM_ERROR", withDetail("Bambu ist gerade nicht erreichbar. Bitte später erneut versuchen.", err));
    default:
      return new AppError(
        "UPSTREAM_ERROR",
        withDetail("Bambu hat unerwartet geantwortet. Die inoffizielle Schnittstelle hat sich evtl. geändert.", err)
      );
  }
}

// Prueft jede Spule einzeln: kaputte Eintraege werden gezaehlt und uebersprungen, ein ganzes Ergebnis wird nie blind uebernommen.
export function parseBambuHits(hits: readonly unknown[]): { spools: BambuSpool[]; skipped: number } {
  const spools: BambuSpool[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const hit of hits) {
    const parsed = bambuSpoolSchema.safeParse(hit);
    if (!parsed.success || seen.has(parsed.data.id)) {
      skipped += 1;
      continue;
    }
    seen.add(parsed.data.id);
    spools.push(parsed.data);
  }
  return { spools, skipped };
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function mapBambuSpool(spool: BambuSpool): MappedSpool {
  const typeName = clean(spool.filamentType);
  const materialName = clean(spool.filamentName) || typeName || "Filament";
  const total = spool.totalNetWeight && spool.totalNetWeight > 0 ? Math.round(spool.totalNetWeight) : DEFAULT_TOTAL_G;
  const remaining = Math.min(total, Math.max(0, Math.round(spool.netWeight ?? total)));
  const colorHex = normalizeHexColor(spool.color);
  return {
    cloudId: spool.id,
    vendor: clean(spool.filamentVendor) || UNKNOWN_VENDOR,
    materialName,
    typeName: typeName || materialName,
    colorHex,
    colorName: nearestColorName(colorHex),
    remainingG: remaining,
    totalG: total,
    status: spool.status ?? null,
    inPrinter: spool.inPrinter === true,
    deviceName: clean(spool.deviceName) || null
  };
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

export async function buildPreview(inventoryId: string, session: ImportSession): Promise<BambuPreview> {
  const spools = session.spools ?? [];
  const [imported, manufacturers, materials] = await Promise.all([
    prisma.spool.findMany({ where: { inventoryId, bambuCloudId: { not: null } }, select: { bambuCloudId: true } }),
    prisma.manufacturer.findMany({ select: { id: true, name: true } }),
    prisma.material.findMany({ select: { name: true, manufacturerId: true } })
  ]);
  const importedIds = new Set(imported.map((spool) => spool.bambuCloudId));
  const manufacturerByName = new Map(manufacturers.map((manufacturer) => [key(manufacturer.name), manufacturer.id]));

  const rows: BambuPreviewRow[] = spools.map((spool) => {
    const mapped = mapBambuSpool(spool);
    const manufacturerId = manufacturerByName.get(key(mapped.vendor)) ?? null;
    const materialExists = materials.some(
      (material) =>
        key(material.name) === key(mapped.materialName) &&
        (material.manufacturerId === null || (manufacturerId !== null && material.manufacturerId === manufacturerId))
    );
    return {
      cloudId: mapped.cloudId,
      vendor: mapped.vendor,
      materialName: mapped.materialName,
      colorHex: mapped.colorHex,
      colorName: mapped.colorName,
      remainingG: mapped.remainingG,
      totalG: mapped.totalG,
      status: mapped.status,
      inPrinter: mapped.inPrinter,
      deviceName: mapped.deviceName,
      alreadyImported: importedIds.has(mapped.cloudId),
      manufacturerExists: manufacturerId !== null,
      materialExists
    };
  });
  return { rows, skipped: session.skipped };
}

type Tx = Prisma.TransactionClient;
interface CatalogMaterial {
  id: string;
  name: string;
  manufacturerId: string | null;
  printTempMinC: number;
  printTempMaxC: number;
  bedTempC: number | null;
}
interface ImportContext {
  tx: Tx;
  inventoryId: string;
  input: BambuImportInput;
  summary: BambuImportSummary;
  manufacturers: Map<string, string>;
  materials: CatalogMaterial[];
  existing: Map<string | null, { id: string; initialWeightG: number; remainingWeightG: number }>;
}

const MATERIAL_SELECT = { id: true, name: true, manufacturerId: true, printTempMinC: true, printTempMaxC: true, bedTempC: true } as const;

async function ensureManufacturer(context: ImportContext, spool: MappedSpool): Promise<string> {
  const known = context.manufacturers.get(key(spool.vendor));
  if (known) {
    return known;
  }
  const created = await context.tx.manufacturer.create({ data: { name: spool.vendor } });
  context.manufacturers.set(key(spool.vendor), created.id);
  context.summary.manufacturersCreated += 1;
  return created.id;
}

// Erst ein Produkt des Herstellers, dann ein allgemeines Material gleichen Namens, sonst neu anlegen (Temperaturen vom
// allgemeinen Material gleichen Typs, sonst Standardwerte).
async function ensureMaterial(context: ImportContext, spool: MappedSpool, manufacturerId: string): Promise<CatalogMaterial> {
  const wantedName = key(spool.materialName);
  const found =
    context.materials.find((entry) => key(entry.name) === wantedName && entry.manufacturerId === manufacturerId) ??
    context.materials.find((entry) => key(entry.name) === wantedName && entry.manufacturerId === null);
  if (found) {
    return found;
  }
  const generic = context.materials.find((entry) => entry.manufacturerId === null && key(entry.name) === key(spool.typeName));
  const created = await context.tx.material.create({
    data: {
      name: spool.materialName,
      manufacturerId,
      printTempMinC: generic?.printTempMinC ?? DEFAULT_TEMPS.min,
      printTempMaxC: generic?.printTempMaxC ?? DEFAULT_TEMPS.max,
      bedTempC: generic ? generic.bedTempC : DEFAULT_TEMPS.bed
    },
    select: MATERIAL_SELECT
  });
  context.materials.push(created);
  context.summary.materialsCreated += 1;
  return created;
}

async function importOne(context: ImportContext, spool: MappedSpool): Promise<void> {
  const already = context.existing.get(spool.cloudId);
  if (already) {
    if (context.input.updateExisting) {
      const remaining = Math.min(spool.remainingG, already.initialWeightG);
      await context.tx.spool.update({ where: { id: already.id }, data: { remainingWeightG: remaining } });
      await recordWeightChange(
        { spoolId: already.id, inventoryId: context.inventoryId, before: already.remainingWeightG, after: remaining, source: "CLOUD_IMPORT" },
        context.tx
      );
      context.summary.updated += 1;
    } else {
      context.summary.skipped += 1;
    }
    return;
  }
  const manufacturerId = await ensureManufacturer(context, spool);
  const material = await ensureMaterial(context, spool, manufacturerId);
  await context.tx.spool.create({
    data: {
      materialId: material.id,
      manufacturerId,
      inventoryId: context.inventoryId,
      colorName: spool.colorName,
      colorHex: spool.colorHex,
      initialWeightG: spool.totalG,
      remainingWeightG: spool.remainingG,
      location: spool.inPrinter ? spool.deviceName : null,
      bambuCloudId: spool.cloudId
    }
  });
  context.summary.created += 1;
}

// Uebernimmt die gewaehlten Spulen in das Lager - alles in EINER Transaktion (bei einem Fehler bleibt alles unveraendert).
export async function importSelected(
  inventoryId: string,
  session: ImportSession,
  input: BambuImportInput
): Promise<BambuImportSummary> {
  const wanted = new Set(input.cloudIds);
  const selected = (session.spools ?? []).filter((spool) => wanted.has(spool.id)).map((spool) => mapBambuSpool(spool));
  const summary: BambuImportSummary = {
    created: 0,
    updated: 0,
    skipped: input.cloudIds.length - selected.length,
    manufacturersCreated: 0,
    materialsCreated: 0
  };

  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.spool.findMany({
        where: { inventoryId, bambuCloudId: { in: selected.map((spool) => spool.cloudId) } },
        select: { id: true, bambuCloudId: true, initialWeightG: true, remainingWeightG: true }
      });
      const context: ImportContext = {
        tx,
        inventoryId,
        input,
        summary,
        manufacturers: new Map((await tx.manufacturer.findMany({ select: { id: true, name: true } })).map((m) => [key(m.name), m.id])),
        materials: await tx.material.findMany({ select: MATERIAL_SELECT }),
        existing: new Map(existing.map((spool) => [spool.bambuCloudId, spool]))
      };
      for (const spool of selected) {
        await importOne(context, spool);
      }
    },
    { timeout: 60_000 }
  );
  return summary;
}
