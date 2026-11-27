import mqtt, { type MqttClient } from "mqtt";
import type { PrinterLiveStatus } from "@filapilot/shared";
import { wireReportClient } from "./bambuReportStream.js";

// Bambu-Lab-Drucker exponieren lokal einen MQTT-Broker auf Port 8883 (TLS, selbstsigniert),
// User "bblp", Passwort = Access-Code aus den Drucker-Einstellungen. Je nach Firmware ist dafuer der LAN-Modus noetig -
// wer den nicht nutzen will, verbindet den Drucker ueber die Bambu Cloud (bambuCloudConnector.ts).

export interface BambuConnectionParams {
  printerId: string;
  ipAddress: string;
  serialNumber: string;
  accessCode: string;
}

export type LiveStatusListener = (status: PrinterLiveStatus) => void;

export function connectToBambuPrinter(
  params: BambuConnectionParams,
  onStatus: LiveStatusListener,
  onConnectionLost: () => void
): MqttClient {
  const client = mqtt.connect(`mqtts://${params.ipAddress}:8883`, {
    username: "bblp",
    password: params.accessCode,
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    connectTimeout: 5000
  });
  wireReportClient(client, { printerId: params.printerId, serialNumber: params.serialNumber }, onStatus, undefined, onConnectionLost);
  return client;
}
