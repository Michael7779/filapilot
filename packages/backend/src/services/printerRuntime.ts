import type { Printer } from "@prisma/client";
import type { MqttClient } from "mqtt";
import type { PrinterLiveStatus } from "@filapilot/shared";
import { connectToBambuPrinter } from "./bambuConnector.js";
import { broadcastPrinterStatus } from "../socket.js";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";

// Haelt pro Drucker die aktive MQTT-Verbindung, den zuletzt bekannten Status und (bei
// SyncMode PERIODIC) den Broadcast-Timer. Bewusst In-Memory statt DB - das ist Laufzeitzustand,
// keine dauerhaften Daten, und wird beim Serverstart aus der DB neu aufgebaut.
const activeConnections = new Map<string, MqttClient>();
const latestStatus = new Map<string, PrinterLiveStatus>();
const periodicTimers = new Map<string, ReturnType<typeof setInterval>>();

function disconnectedStatus(printerId: string): PrinterLiveStatus {
  return {
    printerId,
    connected: false,
    printing: false,
    currentJobName: null,
    progressPercent: null,
    remainingSeconds: null,
    amsSlots: []
  };
}

export function getLatestStatus(printerId: string): PrinterLiveStatus {
  return latestStatus.get(printerId) ?? disconnectedStatus(printerId);
}

export function connectPrinter(printer: Printer): void {
  disconnectPrinter(printer.id);

  const client = connectToBambuPrinter(
    {
      printerId: printer.id,
      ipAddress: printer.ipAddress,
      serialNumber: printer.serialNumber,
      accessCode: printer.accessCode
    },
    (status) => {
      latestStatus.set(printer.id, status);
      if (printer.syncMode === "LIVE") {
        broadcastPrinterStatus(status);
      }
    }
  );
  activeConnections.set(printer.id, client);

  if (printer.syncMode === "PERIODIC") {
    const timer = setInterval(
      () => broadcastPrinterStatus(getLatestStatus(printer.id)),
      printer.syncIntervalSeconds * 1000
    );
    periodicTimers.set(printer.id, timer);
  }
}

export function disconnectPrinter(printerId: string): void {
  activeConnections.get(printerId)?.end(true);
  activeConnections.delete(printerId);

  const timer = periodicTimers.get(printerId);
  if (timer) {
    clearInterval(timer);
    periodicTimers.delete(printerId);
  }
  latestStatus.delete(printerId);
}

export async function connectAllPrinters(): Promise<void> {
  const printers = await prisma.printer.findMany();
  for (const printer of printers) {
    connectPrinter(printer);
  }
  logger.info(`${printers.length} Drucker-Verbindung(en) gestartet`);
}
