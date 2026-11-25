import {
  AMS_SLOTS_PER_UNIT,
  EXTERNAL_AMS_SLOT_INDEX,
  MAX_AMS_UNITS,
  type AmsSlotStatus,
  type PrinterLiveStatus,
  type PrintState
} from "@filapilot/shared";

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

// Eine Zahl, die der Drucker als String ("0") oder Zahl melden kann; alles andere ist keine gueltige Kennung.
function toIntegerId(value: unknown): number | null {
  let index = Number.NaN;
  if (typeof value === "number") {
    index = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    index = Number(value);
  }
  return Number.isInteger(index) ? index : null;
}

// Die AMS-Kammer meldet ihren Index als String-"id" ("0".."3"); alles andere ist kein gueltiger Slot.
function trayIndex(tray: unknown): number | null {
  const index = toIntegerId(
    typeof tray === "object" && tray !== null ? (tray as { id?: unknown }).id : undefined
  );
  return index !== null && index >= 0 && index < AMS_SLOTS_PER_UNIT ? index : null;
}

// Alle AMS-Einheiten in Reihe (Index 0-3, wie vom Drucker per "id" gemeldet - ohne "id" zaehlt die Position in der Liste).
// Andere Einheiten (z.B. AMS HT mit eigener Kennung) werden nicht ausgewertet, weil ihr Aufbau nicht verifiziert ist.
function amsUnits(print: Record<string, unknown>): { unit: number; trays: unknown[] }[] {
  const ams = print.ams as { ams?: unknown[] } | undefined;
  if (!Array.isArray(ams?.ams)) {
    return [];
  }
  const units: { unit: number; trays: unknown[] }[] = [];
  ams.ams.forEach((raw, position) => {
    if (typeof raw !== "object" || raw === null) {
      return;
    }
    const { id, tray } = raw as { id?: unknown; tray?: unknown };
    const unit = id === undefined ? position : toIntegerId(id);
    if (unit !== null && unit >= 0 && unit < MAX_AMS_UNITS && Array.isArray(tray)) {
      units.push({ unit, trays: tray });
    }
  });
  return units;
}

function parseAmsSlots(print: Record<string, unknown>): AmsSlotStatus[] {
  const slots: AmsSlotStatus[] = [];
  for (const { unit, trays } of amsUnits(print)) {
    for (const tray of trays) {
      const index = trayIndex(tray);
      const parsed = index === null ? null : parseTray(tray, unit * AMS_SLOTS_PER_UNIT + index);
      if (parsed) {
        slots.push(parsed);
      }
    }
  }
  const external = parseTray(print.vt_tray, EXTERNAL_AMS_SLOT_INDEX);
  if (external) {
    slots.push(external);
  }
  return slots;
}

// Die Verbindung (lokal bzw. Cloud) liegt in bambuLocalConnector.ts/bambuCloudConnector.ts, das Zusammenfuehren von Teil-Reports in
// bambuReportStream.ts. Dieses Parsen ist isoliert vom MQTT-Transport gehalten, damit es mit einem Mock-Payload unit-testbar ist
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
