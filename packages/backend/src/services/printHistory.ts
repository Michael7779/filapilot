import { colorDistanceSquared, materialTypeOf } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { SYSTEM_ACTOR, recordAudit, type AuditActor } from "./auditService.js";
import { getBambuCloudClient, logBambuFailure } from "./bambuCloudClient.js";
import { getStoredToken } from "./bambuConnectionService.js";
import { getInventoryRow } from "./inventoryService.js";
import { parseTaskHistory, type HistoryFilament, type HistoryTask, type ParsedHistory } from "./printHistoryParser.js";
import { recordWeightChange } from "./spoolWeightLog.js";
import { MAX_COLOR_DISTANCE_SQUARED } from "./unopenedSpoolMatch.js";

// Erfasst fertige Drucke der Cloud-Drucker aus der Druckhistorie der Bambu-Cloud als Druckauftraege (ersetzt fuer Cloud-
// Drucker die Rechnung aus den AMS-Prozenten, die an echten Geraeten nicht sinkt).
//
// Threat-Model: (1) Eingeloggte Benutzer koennten Buchungen wiederholt ausloesen, und falsche oder alte Eintraege der Cloud
// koennten Verbrauch doppelt oder auf fremde Spulen buchen. (2) Serverseitig erzwungen: nur mit der Anmeldung des Lagers,
// nur Drucker UND Spulen dieses Lagers, nur Erfolge nach Beginn der Erfassung (Printer.historyFrom), je Auftrag und Fach
// hoechstens einmal (nacheinander), Material und Farbe muessen zur Spule im Fach passen. (3) Negativ-Tests:
// tests/security/printHistoryScope.test.ts, tests/integration/printHistory.test.ts.

// Die Cloud schliesst einen Auftrag erst kurz nach dem Druckende ab - deshalb zweimal nachsehen.
const CHECK_DELAYS_MS = [60_000, 10 * 60_000];

type Outcome = "recorded" | "already" | "noSpool" | "mismatch";
type Tally = Record<Outcome | "unknownPrinter" | "old", number>;

interface CloudPrinter {
  id: string;
  name: string;
  serialNumber: string;
  historyFrom: Date;
}

interface Run {
  inventory: { id: string; name: string };
  actor: AuditActor;
  tally: Tally;
}

const spoolSelect = {
  id: true,
  inventoryId: true,
  colorName: true,
  colorHex: true,
  colorHex2: true,
  initialWeightG: true,
  purchasePriceCents: true,
  bambuCloudId: true,
  material: { select: { name: true } }
} as const;

async function spoolInSlot(printerId: string, slotIndex: number) {
  const assignment = await prisma.amsSlotAssignment.findUnique({
    where: { printerId_slotIndex: { printerId, slotIndex } },
    select: { spool: { select: spoolSelect } }
  });
  return assignment?.spool ?? null;
}

type SlotSpool = NonNullable<Awaited<ReturnType<typeof spoolInSlot>>>;

// Schutz vor einem Spulenwechsel zwischen Druck und Abfrage.
function matchesSpool(spool: SlotSpool, filament: HistoryFilament): boolean {
  const type = (name: string): string => materialTypeOf(name).toUpperCase();
  if (filament.material && type(spool.material.name) !== type(filament.material)) {
    return false;
  }
  const wanted = filament.colorHex;
  const colors = [spool.colorHex, spool.colorHex2].filter((color): color is string => color !== null);
  return !wanted || colors.length === 0 || colors.some((color) => colorDistanceSquared(color, wanted) <= MAX_COLOR_DISTANCE_SQUARED);
}

// Spulen aus der Cloud bekommen ihr Restgewicht beim Abgleich - hier wird bei ihnen nichts abgezogen (sonst doppelt).
async function book(printer: CloudPrinter, task: HistoryTask, filament: HistoryFilament, spool: SlotSpool, key: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (spool.bambuCloudId === null) {
      const { remainingWeightG } = await tx.spool.findUniqueOrThrow({ where: { id: spool.id }, select: { remainingWeightG: true } });
      const after = Math.max(0, remainingWeightG - filament.weightG);
      await tx.spool.update({ where: { id: spool.id }, data: { remainingWeightG: after, lastModifiedAt: new Date() } });
      await recordWeightChange({ spoolId: spool.id, inventoryId: spool.inventoryId, before: remainingWeightG, after, source: "PRINT" }, tx);
    }
    await tx.spool.updateMany({ where: { id: spool.id, openedAt: null }, data: { openedAt: new Date() } });
    await tx.printJob.create({
      data: {
        printerId: printer.id,
        spoolId: spool.id,
        name: task.name,
        filamentUsedG: filament.weightG,
        costCents:
          spool.purchasePriceCents === null ? null : Math.round((filament.weightG / spool.initialWeightG) * spool.purchasePriceCents),
        succeeded: true,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        cloudTaskKey: key
      }
    });
  });
}

async function recordFilament(run: Run, printer: CloudPrinter, task: HistoryTask, filament: HistoryFilament): Promise<Outcome> {
  const key = `${task.id}:${filament.slotIndex}`;
  const known = await prisma.printJob.findFirst({ where: { printerId: printer.id, cloudTaskKey: key }, select: { id: true } });
  if (known) {
    return "already";
  }
  const spool = await spoolInSlot(printer.id, filament.slotIndex);
  if (!spool || spool.inventoryId !== run.inventory.id) {
    return "noSpool";
  }
  if (!matchesSpool(spool, filament)) {
    return "mismatch";
  }
  await book(printer, task, filament, spool, key);
  await recordAudit({
    actor: run.actor,
    action: "EVENT",
    area: "PRINTER",
    entityId: printer.id,
    inventory: run.inventory,
    description: `${printer.name}: Druck erfasst (${filament.weightG} g, ${spool.material.name} ${spool.colorName})`
  });
  return "recorded";
}

async function recordTasks(run: Run, printers: CloudPrinter[], history: ParsedHistory): Promise<void> {
  const bySerial = new Map(printers.map((printer) => [printer.serialNumber.trim().toUpperCase(), printer]));
  // Aelteste zuerst, damit Gewichtsverlauf und Liste in der Reihenfolge der Drucke entstehen.
  for (const task of [...history.finished].sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime())) {
    const printer = bySerial.get(task.serialNumber);
    if (!printer) {
      run.tally.unknownPrinter += 1;
    } else if (task.finishedAt <= printer.historyFrom) {
      run.tally.old += 1;
    } else {
      for (const filament of task.filaments) {
        run.tally[await recordFilament(run, printer, task, filament)] += 1;
      }
    }
  }
}

async function checkHistory(inventoryId: string, run: Run): Promise<void> {
  const printers = await prisma.printer.findMany({
    where: { inventoryId, connectionMode: "CLOUD" },
    select: { id: true, name: true, serialNumber: true, historyFrom: true }
  });
  const stored = printers.length > 0 ? await getStoredToken(inventoryId) : null;
  if (!stored) {
    return;
  }
  let raw: unknown[];
  try {
    raw = await getBambuCloudClient().listTasks(stored.region, stored.token);
  } catch (err) {
    logBambuFailure(err);
    return;
  }
  const history = parseTaskHistory(raw);
  await recordTasks(run, printers, history);
  // Nur Anzahlen - hilft herauszufinden, warum ein Druck nicht erfasst wurde.
  logger.info("Bambu-Cloud Druckhistorie: ausgewertet", {
    inventoryId,
    ...run.tally,
    notFinished: history.notFinished,
    unreadable: history.unreadable
  });
}

async function runCheck(inventoryId: string, actor: AuditActor): Promise<number> {
  const tally: Tally = { recorded: 0, already: 0, noSpool: 0, mismatch: 0, unknownPrinter: 0, old: 0 };
  try {
    const inventory = await getInventoryRow(inventoryId);
    await checkHistory(inventoryId, { inventory, actor, tally });
  } catch (err) {
    logger.error("Druckhistorie konnte nicht ausgewertet werden", { inventoryId, err: err instanceof Error ? err.message : String(err) });
  }
  return tally.recorded;
}

// Je Lager laeuft immer nur eine Auswertung - zwei gleichzeitige wuerden denselben Druck doppelt buchen.
const queues = new Map<string, Promise<number>>();

// Gibt die Zahl neu erfasster Eintraege zurueck und wirft nie (Abgleich und Status-Anzeige duerfen nicht daran scheitern).
export function recordPrintHistory(inventoryId: string, actor: AuditActor): Promise<number> {
  const next = (queues.get(inventoryId) ?? Promise.resolve(0)).then(() => runCheck(inventoryId, actor));
  queues.set(inventoryId, next);
  return next;
}

export interface ScheduleOptions {
  delaysMs?: number[];
  run?: (inventoryId: string, actor: AuditActor) => Promise<number>;
}

const pendingChecks = new Map<string, ReturnType<typeof setTimeout>[]>();

// Nach einem Druckende: verzoegert nachsehen. Ein weiteres Druckende ersetzt die noch ausstehenden Pruefungen.
export function schedulePrintHistoryCheck(inventoryId: string, options: ScheduleOptions = {}): void {
  const run = options.run ?? recordPrintHistory;
  pendingChecks.get(inventoryId)?.forEach(clearTimeout);
  pendingChecks.set(
    inventoryId,
    (options.delaysMs ?? CHECK_DELAYS_MS).map((delay) => {
      const timer = setTimeout(() => void run(inventoryId, SYSTEM_ACTOR), delay);
      // Ausstehende Pruefungen halten den Prozess nicht am Leben.
      timer.unref();
      return timer;
    })
  );
}
