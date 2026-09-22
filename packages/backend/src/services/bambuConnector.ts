import mqtt, { type MqttClient } from "mqtt";
import type { PrinterLiveStatus } from "@filapilot/shared";
import { logger } from "../logger.js";

// Bambu-Lab-Drucker exponieren lokal einen MQTT-Broker auf Port 8883 (TLS, selbstsigniert),
// User "bblp", Passwort = Access-Code aus den Drucker-Einstellungen. Das exakte Report-Topic/
// -Payload-Format variiert leicht je nach Firmware-Version - diese Funktion liefert das Grundgeruest
// (Verbindung + Parsing-Einstiegspunkt); die konkrete Feld-Zuordnung wird beim Bau der Drucker-Route
// gegen einen echten Drucker verifiziert und getestet (siehe docs/requirements/printer.md).

export interface BambuConnectionParams {
  printerId: string;
  ipAddress: string;
  serialNumber: string;
  accessCode: string;
}

export type LiveStatusListener = (status: PrinterLiveStatus) => void;

export function connectToBambuPrinter(
  params: BambuConnectionParams,
  onStatus: LiveStatusListener
): MqttClient {
  const client = mqtt.connect(`mqtts://${params.ipAddress}:8883`, {
    username: "bblp",
    password: params.accessCode,
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    connectTimeout: 5000
  });

  client.on("connect", () => {
    logger.info("Mit Bambu-Drucker verbunden", { printerId: params.printerId });
    client.subscribe(`device/${params.serialNumber}/report`);
  });

  client.on("message", (_topic, payload) => {
    try {
      const raw: unknown = JSON.parse(payload.toString());
      const status = parseBambuReport(params.printerId, raw);
      if (status) {
        onStatus(status);
      }
    } catch (err) {
      logger.warn("Konnte Bambu-Report nicht parsen", { printerId: params.printerId, err });
    }
  });

  client.on("error", (err) => {
    logger.error("Bambu-MQTT-Verbindungsfehler", { printerId: params.printerId, err });
  });

  return client;
}

// Isoliert vom MQTT-Transport gehalten, damit es mit einem Mock-Payload unit-testbar ist
// (siehe tests/unit/bambuConnector.test.ts) - ohne echten Drucker oder echte Verbindung.
export function parseBambuReport(printerId: string, raw: unknown): PrinterLiveStatus | null {
  if (typeof raw !== "object" || raw === null || !("print" in raw)) {
    return null;
  }
  const print = (raw as { print?: Record<string, unknown> }).print;
  if (!print) {
    return null;
  }

  return {
    printerId,
    connected: true,
    printing: print.gcode_state === "RUNNING",
    currentJobName: typeof print.subtask_name === "string" ? print.subtask_name : null,
    progressPercent: typeof print.mc_percent === "number" ? print.mc_percent : null,
    remainingSeconds:
      typeof print.mc_remaining_time === "number" ? print.mc_remaining_time * 60 : null,
    amsSlots: []
  };
}
