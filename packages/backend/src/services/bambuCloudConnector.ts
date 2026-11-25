import mqtt, { type MqttClient } from "mqtt";
import type { BambuRegion, PrinterLiveStatus } from "@filapilot/shared";
import { wireReportClient } from "./bambuReportStream.js";

// Status eines Druckers ueber den MQTT-Broker der Bambu Cloud (derselbe Weg wie die Bambu-App): Benutzer "u_<Nutzer-ID>",
// Passwort = Zugangs-Token des Kontos, Topic device/<Seriennummer>/report. Das Report-Format ist dasselbe wie lokal.
// Der Broker ist fest je Region (nie vom Client), das Zertifikat wird geprueft (anders als beim selbstsignierten Drucker).

const BROKER_HOST: Record<BambuRegion, string> = {
  global: "us.mqtt.bambulab.com",
  china: "cn.mqtt.bambulab.com"
};

export interface BambuCloudBroker {
  url: string;
  username: string;
}

export function bambuCloudBroker(region: BambuRegion, userId: string): BambuCloudBroker {
  return { url: `mqtts://${BROKER_HOST[region]}:8883`, username: `u_${userId}` };
}

export interface BambuCloudMqttParams {
  printerId: string;
  serialNumber: string;
  region: BambuRegion;
  userId: string;
  token: string;
}

// onAuthRejected: der Broker hat Nutzer-ID/Token abgelehnt (Token abgelaufen) - die Verbindung ist dann beendet.
export function connectToBambuCloud(
  params: BambuCloudMqttParams,
  onStatus: (status: PrinterLiveStatus) => void,
  onAuthRejected: () => void
): MqttClient {
  const broker = bambuCloudBroker(params.region, params.userId);
  const client = mqtt.connect(broker.url, {
    username: broker.username,
    password: params.token,
    reconnectPeriod: 10_000,
    connectTimeout: 10_000
  });
  wireReportClient(client, { printerId: params.printerId, serialNumber: params.serialNumber }, onStatus, onAuthRejected);
  return client;
}
