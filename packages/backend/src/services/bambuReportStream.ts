import type { PrinterLiveStatus } from "@filapilot/shared";
import { logger } from "../logger.js";
import { parseBambuReport } from "./bambuConnector.js";

// Gemeinsamer Teil der lokalen und der Cloud-Verbindung: Report abonnieren, vollen Stand anfordern, Reports zusammenfuehren.

// Das Wenige, was von einem MQTT-Client gebraucht wird (der echte Client und ein Fake in den Tests erfuellen es gleichermassen).
export interface ReportTransport {
  on(event: "connect", listener: () => void): unknown;
  on(event: "message", listener: (topic: string, payload: Buffer) => void): unknown;
  on(event: "error", listener: (err: Error) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  subscribe(topic: string): unknown;
  publish(topic: string, message: string): unknown;
  end(force?: boolean): unknown;
}

export interface ReportTarget {
  printerId: string;
  serialNumber: string;
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasId(value: unknown): value is PlainObject & { id: string | number } {
  return isPlainObject(value) && (typeof value.id === "string" || typeof value.id === "number");
}

// Listen aus Objekten mit "id" (AMS-Einheiten, Kammern) werden ueber die id zusammengefuehrt, alle anderen Listen ersetzt.
function mergeLists(previous: unknown[], delta: unknown[]): unknown[] {
  if (!delta.every(hasId) || !previous.every(hasId)) {
    return delta;
  }
  const merged: unknown[] = [...previous];
  for (const entry of delta) {
    const index = merged.findIndex((old) => hasId(old) && String(old.id) === String(entry.id));
    if (index === -1) {
      merged.push(entry);
    } else {
      merged[index] = mergeValue(merged[index], entry);
    }
  }
  return merged;
}

function mergeValue(previous: unknown, delta: unknown): unknown {
  if (Array.isArray(previous) && Array.isArray(delta)) {
    return mergeLists(previous, delta);
  }
  if (isPlainObject(previous) && isPlainObject(delta)) {
    const merged: PlainObject = { ...previous };
    for (const [key, value] of Object.entries(delta)) {
      merged[key] = key in previous ? mergeValue(previous[key], value) : value;
    }
    return merged;
  }
  return delta;
}

// Drucker der P1/A1-Serie senden nach dem ersten vollen Stand nur noch geaenderte Felder. Ohne Zusammenfuehren wuerde jeder
// Teil-Report (z.B. nur der Fortschritt) die AMS-Anzeige leeren. Pro Verbindung ein eigener Stand.
export function createReportAccumulator(printerId: string): (raw: unknown) => PrinterLiveStatus | null {
  let print: PlainObject | null = null;
  return (raw) => {
    if (!isPlainObject(raw) || !isPlainObject(raw.print)) {
      return null;
    }
    const merged = print ? mergeValue(print, raw.print) : raw.print;
    print = isPlainObject(merged) ? merged : raw.print;
    return parseBambuReport(printerId, { print });
  };
}

const PUSHALL_REQUEST = JSON.stringify({
  pushing: { sequence_id: "0", command: "pushall", version: 1, push_target: 1 }
});

// MQTT-Fehlercodes 4 (falsche Zugangsdaten) und 5 (nicht autorisiert) der CONNACK-Antwort.
function isAuthRejection(err: Error): boolean {
  return "code" in err && (err.code === 4 || err.code === 5);
}

export function wireReportClient(
  client: ReportTransport,
  target: ReportTarget,
  onStatus: (status: PrinterLiveStatus) => void,
  onAuthRejected?: () => void,
  onConnectionLost?: () => void
): void {
  const accumulate = createReportAccumulator(target.printerId);

  client.on("connect", () => {
    logger.info("Mit Bambu-Drucker verbunden", { printerId: target.printerId });
    client.subscribe(`device/${target.serialNumber}/report`);
    // Ohne diese Anfrage meldet ein Drucker (v.a. P1/A1) erst bei einer Aenderung - die AMS bliebe bis dahin leer.
    client.publish(`device/${target.serialNumber}/request`, PUSHALL_REQUEST);
  });

  client.on("message", (_topic, payload) => {
    try {
      const status = accumulate(JSON.parse(payload.toString()));
      if (status) {
        onStatus(status);
      }
    } catch (err) {
      logger.warn("Konnte Bambu-Report nicht parsen", { printerId: target.printerId, err });
    }
  });

  client.on("close", () => onConnectionLost?.());

  client.on("error", (err) => {
    // Die Meldung des Fehlers steht ausdruecklich im Protokoll (ein Error-Objekt allein wird sonst leer ausgegeben) - sie
    // enthaelt Grund und Code des Brokers, aber weder Token noch Access-Code.
    logger.error("Bambu-MQTT-Verbindungsfehler", {
      printerId: target.printerId,
      reason: err.message,
      code: "code" in err ? err.code : undefined
    });
    if (onAuthRejected && isAuthRejection(err)) {
      // Weiter probieren hilft bei falschen Zugangsdaten nicht - die Verbindung wird beendet, bis neue Zugangsdaten da sind.
      client.end(true);
      onAuthRejected();
    }
  });
}
