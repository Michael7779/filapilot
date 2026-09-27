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

const previousState = new Map<string, PrintState>();
const activeJobs = new Map<string, ActiveJob>();

export function resetPrintJobTrackerForTests(): void {
  previousState.clear();
  activeJobs.clear();
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
        await tx.spool.update({ where: { id: spool.id }, data: { remainingWeightG: remainingAfter } });
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
  const previous = previousState.get(printer.id) ?? null;
  const transition = decideTransition(previous, status.printState);
  previousState.set(printer.id, status.printState);

  try {
    if (transition === "start") {
      activeJobs.set(printer.id, { name: status.currentJobName ?? "Druckauftrag", startedAt: now });
      await captureStart(printer, status);
    } else if (transition === "end") {
      const job = activeJobs.get(printer.id);
      activeJobs.delete(printer.id);
      await finalizeEnd(printer, status, job, now);
    }
  } catch (err) {
    logger.error("Automatische Verbrauchsbuchung aus Druckstatus fehlgeschlagen", { printerId: printer.id, err });
  }
}
