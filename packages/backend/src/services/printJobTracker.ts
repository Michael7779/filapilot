import type { PrinterLiveStatus, PrintState } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { recordWeightChange } from "./spoolWeightLog.js";

// Ein Druckauftrag ist "in Gang" bei RUNNING und PAUSE (Pause/Fortsetzen beginnt keinen neuen Auftrag und
// wirft die Kalibrierung nicht weg). Ein Auftrag endet, sobald er das verlaesst (fertig, fehlgeschlagen, IDLE).
function isActive(state: PrintState | null): boolean {
  return state === "running" || state === "paused";
}

export type JobTransition = "start" | "end" | "none";

// Rein und ohne DB testbar (tests/unit/printJobTracker.test.ts).
export function decideTransition(previous: PrintState | null, next: PrintState): JobTransition {
  const wasActive = isActive(previous);
  const isActiveNow = isActive(next);
  if (!wasActive && isActiveNow) {
    return "start";
  }
  if (wasActive && !isActiveNow) {
    return "end";
  }
  return "none";
}

// Verbrauch in Gramm aus der AMS-Fuellstand-Differenz (Prozent), bezogen auf das Ursprungsgewicht der Spule.
// Negative Differenzen (Spule gewechselt/nachgefuellt) zaehlen nicht als Verbrauch.
export function computeConsumedG(startPercent: number, endPercent: number, initialWeightG: number): number {
  return Math.max(0, Math.round(((startPercent - endPercent) / 100) * initialWeightG));
}

interface ActiveJob {
  name: string;
  startedAt: Date;
}

// In-Memory-Zwischenspeicher (schnell, kein DB-Zugriff bei jedem MQTT-Status), aber bei jeder tatsaechlichen
// Aenderung sofort in Printer.lastKnownPrintState/activeJobName/activeJobStartedAt gespiegelt (siehe hydrate/
// persist unten) - ein Server-Neustart mitten im Druck liest beim naechsten Status den letzten Stand aus der DB
// zurueck, statt faelschlich einen neuen Auftrag zu beginnen und die bisherige Kalibrierung zu verwerfen (OP-P6).
const previousState = new Map<string, PrintState>();
const activeJobs = new Map<string, ActiveJob>();
const hydrated = new Set<string>();

export function resetPrintJobTrackerForTests(): void {
  previousState.clear();
  activeJobs.clear();
  hydrated.clear();
}

async function hydrate(printerId: string): Promise<void> {
  if (hydrated.has(printerId)) {
    return;
  }
  hydrated.add(printerId);
  const row = await prisma.printer.findUnique({
    where: { id: printerId },
    select: { lastKnownPrintState: true, activeJobName: true, activeJobStartedAt: true }
  });
  if (row?.lastKnownPrintState) {
    previousState.set(printerId, row.lastKnownPrintState as PrintState);
  }
  if (row?.activeJobName && row.activeJobStartedAt) {
    activeJobs.set(printerId, { name: row.activeJobName, startedAt: row.activeJobStartedAt });
  }
}

interface TrackedPrinter {
  id: string;
  inventoryId: string | null;
}

export interface PrintJobTrackerDeps {
  now?: () => Date;
}

// Beim Start eines Auftrags: fuer jeden zugeordneten Slot mit bekanntem Fuellstand die Kalibrierung (Checkpoint)
// auf den aktuellen Wert setzen - Basis fuer die Verbrauchsrechnung beim naechsten Ende.
async function captureStart(printer: TrackedPrinter, status: PrinterLiveStatus): Promise<void> {
  const assignments = await prisma.amsSlotAssignment.findMany({
    where: { printerId: printer.id, spoolId: { not: null } },
    include: { spool: true }
  });
  for (const assignment of assignments) {
    if (!assignment.spool || assignment.spool.inventoryId !== printer.inventoryId) {
      continue;
    }
    const reported = status.amsSlots.find((slot) => slot.slotIndex === assignment.slotIndex);
    if (!reported || reported.remainingPercent === null) {
      continue;
    }
    await prisma.amsSlotAssignment.update({
      where: { id: assignment.id },
      data: {
        baselineRemainPercent: reported.remainingPercent,
        baselineRemainingG: assignment.spool.remainingWeightG,
        assignedAt: assignment.assignedAt ?? new Date()
      }
    });
  }
}

// Beim Ende eines Auftrags: fuer jeden zugeordneten Slot mit Kalibrierung und bekanntem End-Fuellstand den
// Verbrauch buchen (Restgewicht, Gewichtsverlauf, Druckauftrag mit Kosten) und die Kalibrierung auffrischen.
async function finalizeEnd(printer: TrackedPrinter, status: PrinterLiveStatus, job: ActiveJob | undefined, now: Date): Promise<void> {
  const assignments = await prisma.amsSlotAssignment.findMany({
    where: { printerId: printer.id, spoolId: { not: null } },
    include: { spool: true }
  });
  for (const assignment of assignments) {
    const spool = assignment.spool;
    if (!spool || spool.inventoryId !== printer.inventoryId) {
      continue;
    }
    const reported = status.amsSlots.find((slot) => slot.slotIndex === assignment.slotIndex);
    const endPercent = reported?.remainingPercent ?? null;
    if (endPercent === null || assignment.baselineRemainPercent === null) {
      continue;
    }
    const consumedG = computeConsumedG(assignment.baselineRemainPercent, endPercent, spool.initialWeightG);
    await prisma.$transaction(async (tx) => {
      let remainingAfter = spool.remainingWeightG;
      if (consumedG > 0) {
        remainingAfter = Math.max(0, spool.remainingWeightG - consumedG);
        await tx.spool.update({ where: { id: spool.id }, data: { remainingWeightG: remainingAfter, lastModifiedAt: now } });
        await recordWeightChange(
          { spoolId: spool.id, inventoryId: spool.inventoryId, before: spool.remainingWeightG, after: remainingAfter, source: "PRINT" },
          tx
        );
        await tx.printJob.create({
          data: {
            printerId: printer.id,
            spoolId: spool.id,
            name: job?.name ?? "Druckauftrag",
            filamentUsedG: consumedG,
            costCents: spool.purchasePriceCents === null ? null : Math.round((consumedG / spool.initialWeightG) * spool.purchasePriceCents),
            succeeded: status.printState === "finished",
            startedAt: job?.startedAt ?? now,
            finishedAt: now
          }
        });
      }
      await tx.amsSlotAssignment.update({
        where: { id: assignment.id },
        data: { baselineRemainPercent: endPercent, baselineRemainingG: remainingAfter }
      });
    });
  }
}

// Wird bei jedem MQTT-Status eines Druckers aufgerufen (aus printerRuntime). Nie in den Aufrufer werfen -
// ein Fehler hier darf die Status-Anzeige/den Socket-Broadcast nicht stoeren.
export async function processPrinterStatus(printer: TrackedPrinter, status: PrinterLiveStatus, deps: PrintJobTrackerDeps = {}): Promise<void> {
  const now = deps.now?.() ?? new Date();
  await hydrate(printer.id);
  const previous = previousState.get(printer.id) ?? null;
  const transition = decideTransition(previous, status.printState);
  if (previous !== status.printState) {
    previousState.set(printer.id, status.printState);
    await prisma.printer.update({ where: { id: printer.id }, data: { lastKnownPrintState: status.printState } }).catch(() => undefined);
  }

  try {
    if (transition === "start") {
      const job: ActiveJob = { name: status.currentJobName ?? "Druckauftrag", startedAt: now };
      activeJobs.set(printer.id, job);
      await prisma.printer
        .update({ where: { id: printer.id }, data: { activeJobName: job.name, activeJobStartedAt: job.startedAt } })
        .catch(() => undefined);
      await captureStart(printer, status);
    } else if (transition === "end") {
      const job = activeJobs.get(printer.id);
      activeJobs.delete(printer.id);
      await prisma.printer
        .update({ where: { id: printer.id }, data: { activeJobName: null, activeJobStartedAt: null } })
        .catch(() => undefined);
      await finalizeEnd(printer, status, job, now);
    }
  } catch (err) {
    logger.error("Automatische Verbrauchsbuchung aus Druckstatus fehlgeschlagen", { printerId: printer.id, err });
  }
}
