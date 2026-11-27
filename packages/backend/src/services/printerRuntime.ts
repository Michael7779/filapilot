import type { Printer } from "@prisma/client";
import type { BambuRegion, PrinterLiveStatus } from "@filapilot/shared";
import { connectToBambuPrinter } from "./bambuLocalConnector.js";
import { connectToBambuCloud } from "./bambuCloudConnector.js";
import { BambuCloudError, getBambuCloudClient } from "./bambuCloudClient.js";
import { getStoredToken } from "./bambuConnectionService.js";
import { broadcastPrinterStatus } from "../socket.js";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { processPrinterStatus } from "./printJobTracker.js";

// Haelt pro Drucker die aktive MQTT-Verbindung, den zuletzt bekannten Status und (bei
// SyncMode PERIODIC) den Broadcast-Timer. Bewusst In-Memory statt DB - das ist Laufzeitzustand,
// keine dauerhaften Daten, und wird beim Serverstart aus der DB neu aufgebaut.
interface ActiveConnection {
  end(): void;
  // Erst gesetzt, wenn der (asynchrone) Verbindungsaufbau angestossen wurde - nur zum Abwarten in Tests.
  started?: Promise<void>;
}

type ConnectionIssue = NonNullable<PrinterLiveStatus["issue"]>;

const activeConnections = new Map<string, ActiveConnection>();
const latestStatus = new Map<string, PrinterLiveStatus>();
const periodicTimers = new Map<string, ReturnType<typeof setInterval>>();
const connectionIssues = new Map<string, ConnectionIssue>();
// Nutzer-ID je Lager (aus der Cloud gelesen), solange das Token dasselbe bleibt - spart eine Anfrage je Neuverbinden.
const cloudUserIds = new Map<string, { token: string; userId: string }>();

const CLOUD_RETRY_MS = 60_000;

function disconnectedStatus(printerId: string): PrinterLiveStatus {
  const issue = connectionIssues.get(printerId);
  return {
    printerId,
    connected: false,
    printing: false,
    printState: "unknown",
    currentJobName: null,
    progressPercent: null,
    remainingSeconds: null,
    amsSlots: [],
    ...(issue ? { issue } : {})
  };
}

export function getLatestStatus(printerId: string): PrinterLiveStatus {
  return latestStatus.get(printerId) ?? disconnectedStatus(printerId);
}

type RuntimePrinter = Pick<Printer, "id" | "inventoryId" | "syncMode">;

export function reportPrinterStatus(printer: RuntimePrinter, status: PrinterLiveStatus): void {
  connectionIssues.delete(printer.id);
  latestStatus.set(printer.id, status);
  if (printer.syncMode === "LIVE") {
    broadcastPrinterStatus(status, printer.inventoryId);
  }
  // Verbrauchserkennung laeuft unabhaengig vom Sync-Modus - der Server bekommt bei beiden laufend Reports.
  void processPrinterStatus({ id: printer.id, inventoryId: printer.inventoryId }, status);
}

// Verbindung abgerissen: offene Seiten sollen nicht weiter "Verbunden" zeigen. Bewusst ohne Verbrauchserkennung - ein
// Netzwerk-Aussetzer ist kein Druckende. Weitere Abbrueche derselben Stoerung (Neuversuche) werden nicht erneut gemeldet.
export function reportConnectionLost(printer: RuntimePrinter): void {
  if (latestStatus.delete(printer.id)) {
    broadcastPrinterStatus(disconnectedStatus(printer.id), printer.inventoryId);
  }
}

// Der Grund, warum ein Cloud-Drucker nicht verbindet - geht sofort an offene Seiten.
function reportIssue(printer: RuntimePrinter, issue: ConnectionIssue): void {
  connectionIssues.set(printer.id, issue);
  latestStatus.delete(printer.id);
  broadcastPrinterStatus(disconnectedStatus(printer.id), printer.inventoryId);
}

function connectLocal(printer: Printer): ActiveConnection | null {
  if (!printer.ipAddress || !printer.accessCode) {
    logger.warn("Lokaler Drucker ohne IP-Adresse oder Access-Code, keine Verbindung", { printerId: printer.id });
    return null;
  }
  // Nach einem gewollten Trennen meldet der alte Client nichts mehr (er koennte sonst den Nachfolger "trennen").
  let ended = false;
  const client = connectToBambuPrinter(
    {
      printerId: printer.id,
      ipAddress: printer.ipAddress,
      serialNumber: printer.serialNumber,
      accessCode: printer.accessCode
    },
    (status) => reportPrinterStatus(printer, status),
    () => {
      if (!ended) {
        reportConnectionLost(printer);
      }
    }
  );
  return {
    end: () => {
      ended = true;
      client.end(true);
    }
  };
}

async function cloudUserId(inventoryId: string, stored: { region: BambuRegion; token: string }): Promise<string> {
  const cached = cloudUserIds.get(inventoryId);
  if (cached?.token === stored.token) {
    return cached.userId;
  }
  const userId = await getBambuCloudClient().getUserId(stored.region, stored.token);
  cloudUserIds.set(inventoryId, { token: stored.token, userId });
  return userId;
}

// Verbindet ueber die Bambu-Verbindung des Lagers. Zugangsdaten und Nutzer-ID werden asynchron geholt; wird der Drucker
// inzwischen getrennt, entsteht keine Verbindung mehr. Voruebergehende Fehler (Cloud nicht erreichbar) werden nach einer Minute
// erneut versucht, ein abgelehntes Token nicht (das braucht eine neue Anmeldung bei Bambu, danach verbinden die Drucker neu).
function connectCloud(printer: Printer): ActiveConnection {
  let ended = false;
  let end: () => void = () => undefined;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  async function start(): Promise<void> {
    try {
      const stored = await getStoredToken(printer.inventoryId);
      if (ended) {
        return;
      }
      if (!stored) {
        reportIssue(printer, "cloud_no_account");
        return;
      }
      const userId = await cloudUserId(printer.inventoryId, stored);
      if (ended) {
        return;
      }
      const client = connectToBambuCloud(
        { printerId: printer.id, serialNumber: printer.serialNumber, region: stored.region, userId, token: stored.token },
        (status) => reportPrinterStatus(printer, status),
        () => reportIssue(printer, "cloud_rejected"),
        () => {
          if (!ended) {
            reportConnectionLost(printer);
          }
        }
      );
      end = () => client.end(true);
    } catch (err) {
      if (err instanceof BambuCloudError && err.kind === "unauthorized") {
        reportIssue(printer, "cloud_rejected");
        return;
      }
      logger.warn("Cloud-Verbindung des Druckers konnte nicht aufgebaut werden, neuer Versuch folgt", {
        printerId: printer.id,
        kind: err instanceof BambuCloudError ? err.kind : "unbekannt"
      });
      if (!ended) {
        retryTimer = setTimeout(() => void start(), CLOUD_RETRY_MS);
      }
    }
  }

  const started = start();
  return {
    started,
    end: () => {
      ended = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      end();
    }
  };
}

export function connectPrinter(printer: Printer): void {
  disconnectPrinter(printer.id);

  const connection = printer.connectionMode === "CLOUD" ? connectCloud(printer) : connectLocal(printer);
  if (!connection) {
    return;
  }
  activeConnections.set(printer.id, connection);

  if (printer.syncMode === "PERIODIC") {
    const timer = setInterval(
      () => broadcastPrinterStatus(getLatestStatus(printer.id), printer.inventoryId),
      printer.syncIntervalSeconds * 1000
    );
    periodicTimers.set(printer.id, timer);
  }
}

// Wartet, bis der Verbindungsaufbau eines Druckers angestossen ist (Cloud: Zugangsdaten geholt, Verbindung gestartet oder Grund gesetzt).
// Mit maxMs hoechstens so lange (damit z.B. eine langsame Cloud eine Antwort an den Client nicht aufhaelt).
export async function whenPrinterConnectStarted(printerId: string, maxMs?: number): Promise<void> {
  const started = activeConnections.get(printerId)?.started;
  if (!started || maxMs === undefined) {
    await started;
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, maxMs);
  });
  await Promise.race([started, limit]);
  clearTimeout(timer);
}

export function disconnectPrinter(printerId: string): void {
  activeConnections.get(printerId)?.end();
  activeConnections.delete(printerId);

  const timer = periodicTimers.get(printerId);
  if (timer) {
    clearInterval(timer);
    periodicTimers.delete(printerId);
  }
  latestStatus.delete(printerId);
  connectionIssues.delete(printerId);
}

// Nach einer neuen Bambu-Anmeldung (oder dem Trennen) eines Lagers: die Cloud-Drucker dieses Lagers neu verbinden,
// damit sie das neue Token benutzen bzw. den Grund "keine Verbindung" zeigen.
export async function reconnectCloudPrinters(inventoryId: string): Promise<void> {
  cloudUserIds.delete(inventoryId);
  const printers = await prisma.printer.findMany({ where: { inventoryId, connectionMode: "CLOUD" } });
  for (const printer of printers) {
    connectPrinter(printer);
  }
}

// Fuer Aufrufer, die nicht warten: Fehler werden protokolliert statt verschluckt.
export function reconnectCloudPrintersInBackground(inventoryId: string): void {
  reconnectCloudPrinters(inventoryId).catch((err: unknown) => {
    logger.error("Cloud-Drucker konnten nicht neu verbunden werden", { inventoryId, err });
  });
}

export async function connectAllPrinters(): Promise<void> {
  const printers = await prisma.printer.findMany();
  for (const printer of printers) {
    connectPrinter(printer);
  }
  logger.info(`${printers.length} Drucker-Verbindung(en) gestartet`);
}

export function disconnectAllPrinters(): void {
  for (const printerId of [...activeConnections.keys()]) {
    disconnectPrinter(printerId);
  }
}
