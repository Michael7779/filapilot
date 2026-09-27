import mqtt, { type MqttClient } from "mqtt";
import { EXTERNAL_AMS_SLOT_INDEX, type AmsSlotStatus, type PrinterLiveStatus, type PrintState } from "@filapilot/shared";
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

const GCODE_STATE_MAP: Record<string, PrintState> = {
  RUNNING: "running",
  PREPARE: "running",
  SLICING: "running",
  PAUSE: "paused",
  FINISH: "finished",
  FAILED: "failed",
  IDLE: "idle"
};

function toPrintState(value: unknown): PrintState {
  return (typeof value === "string" ? GCODE_STATE_MAP[value] : undefined) ?? "unknown";
}

// "FFFFFFFF" (RRGGBBAA, wie vom Drucker gemeldet) zu "#RRGGBB" - ohne Alpha-Kanal, den FilaPilot nicht nutzt.
function toColorHex(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-fA-F]{6,8}$/.test(value) ? `#${value.slice(0, 6).toUpperCase()}` : null;
}

// -1 (bzw. jeder Wert ausserhalb 0-100) heisst beim Drucker "nicht kalibriert/unbekannt".
function toRemainPercent(value: unknown): number | null {
  return typeof value === "number" && value >= 0 && value <= 100 ? value : null;
}

// Eine AMS-Kammer oder die externe Spule ("vt_tray") aus dem rohen Report-Objekt.
function parseTray(raw: unknown, slotIndex: number): AmsSlotStatus | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const tray = raw as Record<string, unknown>;
  return {
    slotIndex,
    reportedMaterial: typeof tray.tray_type === "string" && tray.tray_type !== "" ? tray.tray_type : null,
    reportedColorHex: toColorHex(tray.tray_color),
    remainingPercent: toRemainPercent(tray.remain)
  };
}

// Die AMS-Kammer meldet ihren Index als String-"id" ("0".."3"); alles andere ist kein gueltiger Slot.
function trayIndex(tray: unknown): number | null {
  const id = typeof tray === "object" && tray !== null ? (tray as { id?: unknown }).id : undefined;
  const index = typeof id === "string" ? Number(id) : NaN;
  return Number.isInteger(index) && index >= 0 && index <= 3 ? index : null;
}

// Nur die erste AMS-Einheit (typisches Ein-AMS-Setup); mehrere AMS-Einheiten in Reihe werden nicht unterschieden.
function firstAmsTrays(print: Record<string, unknown>): unknown[] {
  const ams = print.ams as { ams?: unknown[] } | undefined;
  const firstUnit = Array.isArray(ams?.ams) ? ams.ams[0] : null;
  const trays = firstUnit && typeof firstUnit === "object" ? (firstUnit as { tray?: unknown[] }).tray : undefined;
  return Array.isArray(trays) ? trays : [];
}

function parseAmsSlots(print: Record<string, unknown>): AmsSlotStatus[] {
  const slots: AmsSlotStatus[] = [];
  for (const tray of firstAmsTrays(print)) {
    const index = trayIndex(tray);
    const parsed = index === null ? null : parseTray(tray, index);
    if (parsed) {
      slots.push(parsed);
    }
  }
  const external = parseTray(print.vt_tray, EXTERNAL_AMS_SLOT_INDEX);
  if (external) {
    slots.push(external);
  }
  return slots;
}

// Isoliert vom MQTT-Transport gehalten, damit es mit einem Mock-Payload unit-testbar ist
// (siehe tests/unit/bambuConnector.test.ts) - ohne echten Drucker oder echte Verbindung. Die Feld-Zuordnung
// (auch fuer AMS/vt_tray) stammt aus oeffentlich dokumentiertem Reverse-Engineering des Bambu-Reports, nicht
// von einem echten Drucker verifiziert - siehe Kommentar oben.
export function parseBambuReport(printerId: string, raw: unknown): PrinterLiveStatus | null {
  if (typeof raw !== "object" || raw === null || !("print" in raw)) {
    return null;
  }
  const print = (raw as { print?: Record<string, unknown> }).print;
  if (!print) {
    return null;
  }
  const printState = toPrintState(print.gcode_state);

  return {
    printerId,
    connected: true,
    printing: printState === "running",
    printState,
    currentJobName: typeof print.subtask_name === "string" ? print.subtask_name : null,
    progressPercent: typeof print.mc_percent === "number" ? print.mc_percent : null,
    remainingSeconds:
      typeof print.mc_remaining_time === "number" ? print.mc_remaining_time * 60 : null,
    amsSlots: parseAmsSlots(print)
  };
}
