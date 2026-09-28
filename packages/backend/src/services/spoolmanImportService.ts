import type { Prisma } from "@prisma/client";
import {
  nearestColorName,
  normalizeHexColor,
  spoolmanSpoolSchema,
  type SpoolmanImportSummary,
  type SpoolmanSpool
} from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { flushAuditEvents, MATERIAL_SELECT, type CatalogMaterial, type SpoolAuditEvent, type Tx } from "./bambuImportService.js";
import { recordWeightChange } from "./spoolWeightLog.js";
import { findUnopenedMatch } from "./unopenedSpoolMatch.js";
import type { AuditActor } from "./auditService.js";

const DEFAULT_TOTAL_G = 1000;
const DEFAULT_TEMPS = { min: 190, max: 230, bed: 60 } as const;
const UNKNOWN_VENDOR = "Unbekannt";

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

interface MappedSpoolmanSpool {
  spoolmanId: string;
  vendor: string;
  materialName: string;
  colorHex: string | null;
  colorName: string;
  remainingG: number;
  totalG: number;
  tareWeightG: number | null;
  note: string | null;
  location: string | null;
  densityGCm3: number | null;
  diameterMm: number | null;
  printTempC: number | null;
  bedTempC: number | null;
}

interface ExistingSpool {
  id: string;
  spoolmanId: string | null;
  initialWeightG: number;
  remainingWeightG: number;
}

interface SpoolmanImportContext {
  tx: Tx;
  inventoryId: string;
  inventoryName: string;
  summary: SpoolmanImportSummary;
  auditEvents: SpoolAuditEvent[];
  manufacturers: Map<string, string>;
  materials: CatalogMaterial[];
  existing: Map<string, ExistingSpool>;
}

// Prueft jeden Eintrag einzeln: ohne erkennbares Filament (Hersteller/Material) ist eine Spule nicht sinnvoll
// zuzuordnen und wird gezaehlt statt uebernommen - wie beim Bambu-Import wird nie blind vom Ergebnis ausgegangen.
export function parseSpoolmanEntries(hits: readonly unknown[]): { spools: SpoolmanSpool[]; skipped: number } {
  const spools: SpoolmanSpool[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const hit of hits) {
    const parsed = spoolmanSpoolSchema.safeParse(hit);
    if (!parsed.success || !parsed.data.filament || seen.has(parsed.data.id)) {
      skipped += 1;
      continue;
    }
    seen.add(parsed.data.id);
    spools.push(parsed.data);
  }
  return { spools, skipped };
}

// Gesamtgewicht: erst von der Spule selbst, sonst vom Filament-Typ, sonst ein Ersatzwert.
function totalWeightOf(raw: SpoolmanSpool): number {
  if (raw.initial_weight && raw.initial_weight > 0) {
    return Math.round(raw.initial_weight);
  }
  if (raw.filament?.weight && raw.filament.weight > 0) {
    return Math.round(raw.filament.weight);
  }
  return DEFAULT_TOTAL_G;
}

// parseSpoolmanEntries hat bereits sichergestellt, dass "filament" gesetzt ist.
function mapSpoolmanSpool(raw: SpoolmanSpool): MappedSpoolmanSpool {
  const filament = raw.filament;
  const vendor = clean(filament?.vendor?.name) || UNKNOWN_VENDOR;
  const materialName = clean(filament?.material) || clean(filament?.name) || "Filament";
  const rawHex = filament?.color_hex ? `#${clean(filament.color_hex).replace(/^#/, "")}` : null;
  const colorHex = normalizeHexColor(rawHex);
  const total = totalWeightOf(raw);
  const usedFallback = raw.used_weight ?? null;
  const remainingRaw = raw.remaining_weight ?? (usedFallback !== null ? total - usedFallback : total);
  const remaining = Math.min(total, Math.max(0, Math.round(remainingRaw)));
  const tare = raw.spool_weight ?? filament?.spool_weight ?? null;
  return {
    spoolmanId: raw.id,
    vendor,
    materialName,
    colorHex,
    colorName: nearestColorName(colorHex),
    remainingG: remaining,
    totalG: total,
    tareWeightG: tare !== null ? Math.max(0, Math.round(tare)) : null,
    note: raw.comment ? clean(raw.comment).slice(0, 500) : null,
    location: raw.location ? clean(raw.location).slice(0, 60) : null,
    densityGCm3: filament?.density ?? null,
    diameterMm: filament?.diameter ?? null,
    printTempC: filament?.settings_extruder_temp ?? null,
    bedTempC: filament?.settings_bed_temp ?? null
  };
}

function describeSpoolman(spool: MappedSpoolmanSpool, materialName: string): string {
  return `${spool.vendor} ${materialName} ${spool.colorName}`;
}

// Bereits importierte Spule (gleiche Spoolman-ID): nur das Restgewicht wird uebernommen, wie beim Bambu-Abgleich.
async function updateExistingSpoolmanSpool(context: SpoolmanImportContext, already: ExistingSpool, spool: MappedSpoolmanSpool): Promise<void> {
  const remaining = Math.min(spool.remainingG, already.initialWeightG);
  if (remaining === already.remainingWeightG) {
    context.summary.skipped += 1;
    return;
  }
  await context.tx.spool.update({ where: { id: already.id }, data: { remainingWeightG: remaining } });
  await recordWeightChange(
    { spoolId: already.id, inventoryId: context.inventoryId, before: already.remainingWeightG, after: remaining, source: "SPOOLMAN_IMPORT" },
    context.tx
  );
  context.auditEvents.push({
    spoolId: already.id,
    action: "UPDATE",
    description: "Restgewicht aus Spoolman aktualisiert",
    before: { remainingWeightG: already.remainingWeightG },
    after: { remainingWeightG: remaining }
  });
  context.summary.updated += 1;
}

async function ensureSpoolmanManufacturer(context: SpoolmanImportContext, spool: MappedSpoolmanSpool): Promise<string> {
  const known = context.manufacturers.get(key(spool.vendor));
  if (known) {
    return known;
  }
  const created = await context.tx.manufacturer.create({ data: { name: spool.vendor } });
  context.manufacturers.set(key(spool.vendor), created.id);
  context.summary.manufacturersCreated += 1;
  return created.id;
}

async function ensureSpoolmanMaterial(context: SpoolmanImportContext, spool: MappedSpoolmanSpool, manufacturerId: string): Promise<CatalogMaterial> {
  const wantedName = key(spool.materialName);
  const found =
    context.materials.find((entry) => key(entry.name) === wantedName && entry.manufacturerId === manufacturerId) ??
    context.materials.find((entry) => key(entry.name) === wantedName && entry.manufacturerId === null);
  if (found) {
    return found;
  }
  const bedTemp = spool.bedTempC !== null ? Math.round(spool.bedTempC) : DEFAULT_TEMPS.bed;
  const printTemp = spool.printTempC !== null ? Math.round(spool.printTempC) : null;
  const created = await context.tx.material.create({
    data: {
      name: spool.materialName,
      manufacturerId,
      printTempMinC: printTemp ?? DEFAULT_TEMPS.min,
      printTempMaxC: printTemp ?? DEFAULT_TEMPS.max,
      bedTempC: bedTemp,
      densityGCm3: spool.densityGCm3,
      filamentDiameterMm: spool.diameterMm ?? 1.75
    },
    select: MATERIAL_SELECT
  });
  context.materials.push(created);
  context.summary.materialsCreated += 1;
  return created;
}

// Statt neu anzulegen: eine bereits vorhandene, eindeutig passende ungeoeffnete Spule mit der Spoolman-ID
// verknuepfen (kein Benutzer da, um nachzufragen - Import laeuft ohne Auswahl, siehe importSpoolmanEntries).
async function linkExistingUnopenedSpoolmanSpool(
  context: SpoolmanImportContext,
  spool: MappedSpoolmanSpool,
  targetSpoolId: string,
  materialName: string
): Promise<void> {
  const target = await context.tx.spool.findUnique({
    where: { id: targetSpoolId },
    select: { id: true, remainingWeightG: true, initialWeightG: true }
  });
  if (!target) {
    return createSpoolmanSpool(context, spool);
  }
  const remaining = Math.min(spool.remainingG, target.initialWeightG);
  await context.tx.spool.update({
    where: { id: target.id },
    data: { spoolmanId: spool.spoolmanId, openedAt: new Date(), remainingWeightG: remaining }
  });
  await recordWeightChange(
    { spoolId: target.id, inventoryId: context.inventoryId, before: target.remainingWeightG, after: remaining, source: "SPOOLMAN_IMPORT" },
    context.tx
  );
  context.auditEvents.push({
    spoolId: target.id,
    action: "EVENT",
    description: `${describeSpoolman(spool, materialName)}: mit Spoolman-Spule verknuepft statt neu angelegt`
  });
  context.summary.linked += 1;
}

// Neue Spule aus Spoolman-Daten anlegen (Hersteller/Material bei Bedarf mit anlegen). Eine Spule, die Spoolman
// bekannt ist, gilt als bereits geoeffnet/in Benutzung.
async function createSpoolmanSpool(context: SpoolmanImportContext, spool: MappedSpoolmanSpool): Promise<void> {
  const manufacturerId = await ensureSpoolmanManufacturer(context, spool);
  const material = await ensureSpoolmanMaterial(context, spool, manufacturerId);
  const match = await findUnopenedMatch(context.tx, context.inventoryId, manufacturerId, material.id, spool.colorHex);
  if (match) {
    return linkExistingUnopenedSpoolmanSpool(context, spool, match.id, material.name);
  }
  const created = await context.tx.spool.create({
    data: {
      materialId: material.id,
      manufacturerId,
      inventoryId: context.inventoryId,
      colorName: spool.colorName,
      colorHex: spool.colorHex,
      initialWeightG: spool.totalG,
      remainingWeightG: spool.remainingG,
      tareWeightG: spool.tareWeightG,
      note: spool.note,
      location: spool.location,
      spoolmanId: spool.spoolmanId,
      openedAt: new Date()
    }
  });
  context.auditEvents.push({
    spoolId: created.id,
    action: "CREATE",
    description: describeSpoolman(spool, material.name),
    after: {
      inventoryName: context.inventoryName,
      manufacturerName: spool.vendor,
      materialName: material.name,
      colorName: spool.colorName,
      colorHex: spool.colorHex,
      colorHex2: null,
      initialWeightG: spool.totalG,
      remainingWeightG: spool.remainingG,
      tareWeightG: spool.tareWeightG,
      location: spool.location,
      note: spool.note,
      purchasePriceCents: null
    }
  });
  context.summary.created += 1;
}

async function importOneSpoolmanSpool(context: SpoolmanImportContext, spool: MappedSpoolmanSpool): Promise<void> {
  const already = context.existing.get(spool.spoolmanId);
  if (already) {
    await updateExistingSpoolmanSpool(context, already, spool);
    return;
  }
  await createSpoolmanSpool(context, spool);
}

// Uebernimmt alle uebergebenen Spulen (schon bekannte werden aktualisiert, neue angelegt) - anders als beim
// Bambu-Import gibt es keine Auswahl, da eine Spoolman-Datei bereits der eigene, kuratierte Bestand ist.
// Alles in EINER Transaktion (bei einem Fehler bleibt alles unveraendert); das Protokoll wird erst danach geschrieben.
export async function importSpoolmanEntries(
  inventoryId: string,
  entries: SpoolmanSpool[],
  actor: AuditActor,
  inventory: { id: string; name: string }
): Promise<SpoolmanImportSummary> {
  const mapped = entries.map(mapSpoolmanSpool);
  const summary: SpoolmanImportSummary = { created: 0, updated: 0, skipped: 0, manufacturersCreated: 0, materialsCreated: 0, linked: 0 };
  let auditEvents: SpoolAuditEvent[] = [];

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const existingRows = await tx.spool.findMany({
        where: { inventoryId, spoolmanId: { in: mapped.map((spool) => spool.spoolmanId) } },
        select: { id: true, spoolmanId: true, initialWeightG: true, remainingWeightG: true }
      });
      const context: SpoolmanImportContext = {
        tx,
        inventoryId,
        inventoryName: inventory.name,
        summary,
        auditEvents: [],
        manufacturers: new Map((await tx.manufacturer.findMany({ select: { id: true, name: true } })).map((m) => [key(m.name), m.id])),
        materials: await tx.material.findMany({ select: MATERIAL_SELECT }),
        existing: new Map(existingRows.filter((row) => row.spoolmanId !== null).map((row) => [row.spoolmanId as string, row]))
      };
      for (const spool of mapped) {
        await importOneSpoolmanSpool(context, spool);
      }
      auditEvents = context.auditEvents;
    },
    { timeout: 60_000 }
  );
  await flushAuditEvents(actor, inventory, auditEvents);
  return summary;
}
