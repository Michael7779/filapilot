import {
  AMS_SLOTS_PER_UNIT,
  colorDistanceSquared,
  EXTERNAL_AMS_SLOT_INDEX,
  MAX_AMS_UNITS,
  normalizeHexColor,
  type AmsSlotStatus,
  type BambuSpool,
  type PrinterLiveStatus
} from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { recordAudit, type AuditActor } from "./auditService.js";
import { getLatestStatus } from "./printerRuntime.js";
import { broadcastAmsChanged } from "../socket.js";
import { MAX_COLOR_DISTANCE_SQUARED } from "./unopenedSpoolMatch.js";

// Ordnet nach einem Cloud-Abgleich die Spulen den AMS-Faechern zu, so wie die Bambu-Cloud sie meldet (Drucker, AMS, Fach).
//
// Threat-Model: Die Angaben stammen aus dem verbundenen Bambu-Konto; falsche Werte wuerden Verbrauch auf falsche oder fremde
// Spulen buchen. Serverseitig erzwungen: nur Drucker UND Spulen des abgeglichenen Lagers, nur Faecher, in denen der Drucker live
// dasselbe Material und eine passende Farbe meldet (die Zaehlweise der Cloud ist nicht dokumentiert), nie ueber eine von Hand
// gewaehlte Spule, nie waehrend eines Drucks. Negativ-Tests: tests/integration/amsAutoAssign.test.ts.

export interface AutoAssignDeps {
  statusOf: (printerId: string) => PrinterLiveStatus;
}

export interface AutoAssignResult {
  assigned: number;
  cleared: number;
}

// Cloud-Kennungen fuer die externe Spule (statt einer AMS-Einheit).
const EXTERNAL_UNIT_IDS = new Set([254, 255]);

function toIndex(value: unknown): number | null {
  const text = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  return /^\d{1,3}$/.test(text) ? Number(text) : null;
}

export function cloudSlotIndex(amsId: unknown, slotId: unknown): number | null {
  const unit = toIndex(amsId);
  if (unit !== null && EXTERNAL_UNIT_IDS.has(unit)) {
    return EXTERNAL_AMS_SLOT_INDEX;
  }
  const tray = toIndex(slotId);
  if (unit === null || tray === null || unit >= MAX_AMS_UNITS || tray >= AMS_SLOTS_PER_UNIT) {
    return null;
  }
  return unit * AMS_SLOTS_PER_UNIT + tray;
}

function matchesLive(spool: BambuSpool, live: AmsSlotStatus): boolean {
  const type = (spool.filamentType ?? "").trim().toUpperCase();
  if (!type || type !== (live.reportedMaterial ?? "").trim().toUpperCase()) {
    return false;
  }
  const color = normalizeHexColor(spool.color);
  return !color || !live.reportedColorHex || colorDistanceSquared(color, live.reportedColorHex) <= MAX_COLOR_DISTANCE_SQUARED;
}

function isOnPrinter(spool: BambuSpool, serialNumber: string): boolean {
  return spool.inPrinter === true && typeof spool.devId === "string" && spool.devId.trim().toUpperCase() === serialNumber.trim().toUpperCase();
}

interface PrinterRow {
  id: string;
  name: string;
  serialNumber: string;
}

interface Run {
  inventory: { id: string; name: string };
  actor: AuditActor;
  cloud: BambuSpool[];
  // Cloud-ID -> Spule dieses Lagers (ohne archivierte)
  spoolIds: Map<string | null, string>;
  result: AutoAssignResult;
}

async function note(run: Run, printer: PrinterRow, description: string): Promise<void> {
  await recordAudit({
    actor: run.actor,
    action: "EVENT",
    area: "PRINTER",
    entityId: printer.id,
    inventory: run.inventory,
    description: `${printer.name}: ${description}`
  });
}

// Welche Spulen die Cloud fuer dieses Fach nennt UND zum Live-Bericht passen.
function candidatesFor(run: Run, printer: PrinterRow, live: AmsSlotStatus): string[] {
  return run.cloud
    .filter((spool) => isOnPrinter(spool, printer.serialNumber))
    .filter((spool) => cloudSlotIndex(spool.amsId, spool.slotId) === live.slotIndex && matchesLive(spool, live))
    .map((spool) => run.spoolIds.get(spool.id))
    .filter((id): id is string => id !== undefined);
}

async function clearSlot(run: Run, printer: PrinterRow, slotIndex: number): Promise<void> {
  await prisma.amsSlotAssignment.deleteMany({ where: { printerId: printer.id, slotIndex, autoAssigned: true } });
  run.result.cleared += 1;
  await note(run, printer, `Slot ${slotIndex} automatisch geleert`);
}

async function fillSlot(run: Run, printer: PrinterRow, slotIndex: number, spoolId: string): Promise<boolean> {
  const manualElsewhere = await prisma.amsSlotAssignment.count({
    where: { spoolId, autoAssigned: false, printer: { inventoryId: run.inventory.id } }
  });
  if (manualElsewhere > 0) {
    return false;
  }
  const values = { spoolId, autoAssigned: true, assignedAt: new Date(), baselineRemainPercent: null, baselineRemainingG: null };
  await prisma.$transaction([
    prisma.amsSlotAssignment.deleteMany({ where: { spoolId, autoAssigned: true, NOT: { printerId: printer.id, slotIndex } } }),
    prisma.amsSlotAssignment.upsert({
      where: { printerId_slotIndex: { printerId: printer.id, slotIndex } },
      create: { printerId: printer.id, slotIndex, ...values },
      update: values
    }),
    prisma.spool.updateMany({ where: { id: spoolId, openedAt: null }, data: { openedAt: new Date() } })
  ]);
  run.result.assigned += 1;
  await note(run, printer, `Slot ${slotIndex} automatisch zugeordnet`);
  return true;
}

async function updateSlot(run: Run, printer: PrinterRow, live: AmsSlotStatus): Promise<void> {
  const current = await prisma.amsSlotAssignment.findUnique({
    where: { printerId_slotIndex: { printerId: printer.id, slotIndex: live.slotIndex } },
    select: { spoolId: true, autoAssigned: true }
  });
  if (current?.spoolId && !current.autoAssigned) {
    return;
  }
  const candidates = candidatesFor(run, printer, live);
  const [only] = candidates;
  // Mehrere Kandidaten: lieber nichts aendern als raten. Passt die bisherige Spule noch, ist nichts zu tun.
  if (candidates.length > 1 || (only !== undefined && only === current?.spoolId)) {
    return;
  }
  const filled = only !== undefined && (await fillSlot(run, printer, live.slotIndex, only));
  if (!filled && current?.autoAssigned && current.spoolId) {
    await clearSlot(run, printer, live.slotIndex);
  }
}

// Nur Feldwerte zur Zaehlweise, nie Seriennummern oder Namen - hilft, wenn auf einer Installation nichts zugeordnet wird.
function logPlacements(cloud: BambuSpool[], printers: PrinterRow[]): void {
  const placements = cloud
    .filter((spool) => spool.inPrinter === true)
    .slice(0, 20)
    .map((spool) => ({
      ams: toIndex(spool.amsId),
      slot: toIndex(spool.slotId),
      knownPrinter: printers.some((printer) => isOnPrinter(spool, printer.serialNumber))
    }));
  logger.info("Bambu-Cloud: Lage der Spulen im Drucker", { placements });
}

async function assignForPrinters(
  inventory: { id: string; name: string },
  printers: PrinterRow[],
  cloud: BambuSpool[],
  actor: AuditActor,
  deps: AutoAssignDeps,
  result: AutoAssignResult
): Promise<void> {
  logPlacements(cloud, printers);
  const spools = await prisma.spool.findMany({
    where: { inventoryId: inventory.id, archivedAt: null, bambuCloudId: { not: null } },
    select: { id: true, bambuCloudId: true }
  });
  const run: Run = { inventory, actor, cloud, spoolIds: new Map(spools.map((spool) => [spool.bambuCloudId, spool.id])), result };
  for (const printer of printers) {
    const status = deps.statusOf(printer.id);
    // Ohne Live-Bericht keine Gegenprobe; waehrend eines Drucks wuerde ein Wechsel die Verbrauchserfassung stoeren.
    if (!status.connected || status.printState === "running" || status.printState === "paused") {
      continue;
    }
    for (const live of status.amsSlots) {
      await updateSlot(run, printer, live);
    }
  }
}

export async function autoAssignAmsSlots(
  inventory: { id: string; name: string },
  cloud: BambuSpool[],
  actor: AuditActor,
  deps: AutoAssignDeps = { statusOf: getLatestStatus }
): Promise<AutoAssignResult> {
  const result: AutoAssignResult = { assigned: 0, cleared: 0 };
  const printers = await prisma.printer.findMany({
    where: { inventoryId: inventory.id },
    select: { id: true, name: true, serialNumber: true }
  });
  if (printers.length > 0) {
    await assignForPrinters(inventory, printers, cloud, actor, deps, result);
  }
  if (result.assigned + result.cleared > 0) {
    broadcastAmsChanged(inventory.id);
  }
  return result;
}
