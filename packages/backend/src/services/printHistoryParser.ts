import { z } from "zod";
import { normalizeHexColor } from "@filapilot/shared";
import { cloudSlotIndex } from "./cloudSlot.js";

// Liest die (inoffizielle, undokumentierte) Druckhistorie der Bambu-Cloud. Alles wird geprueft; was nicht passt, wird
// verworfen statt geraten. Beobachtet an einem echten Konto: status 2 = Erfolg, 1 = "Drucken" (auch fuer nie gestartete
// Auftraege, die so haengen bleiben). Nur Erfolge zaehlen. "weight" ist je Fach die Menge in Gramm.

const STATUS_SUCCESS = 2;
const MAX_FILAMENTS = 64;
const MAX_WEIGHT_G = 100_000;
const MAX_NAME_LENGTH = 120;

export interface HistoryFilament {
  slotIndex: number;
  weightG: number;
  material: string;
  colorHex: string | null;
}

export interface HistoryTask {
  id: string;
  serialNumber: string;
  name: string;
  startedAt: Date;
  finishedAt: Date;
  filaments: HistoryFilament[];
}

export interface ParsedHistory {
  finished: HistoryTask[];
  notFinished: number;
  unreadable: number;
}

const statusSchema = z.object({ status: z.coerce.number().int() });

const taskSchema = z.object({
  id: z.union([z.number().int(), z.string().min(1).max(40)]),
  deviceId: z.string().min(1).max(64),
  title: z.string().optional().catch(undefined),
  designTitle: z.string().optional().catch(undefined),
  startTime: z.unknown().optional(),
  endTime: z.unknown().optional(),
  amsDetailMapping: z.array(z.unknown()).max(MAX_FILAMENTS)
});

const filamentSchema = z.object({
  amsId: z.unknown().optional(),
  slotId: z.unknown().optional(),
  weight: z.coerce.number().positive().max(MAX_WEIGHT_G),
  filamentType: z.string().max(40).optional().catch(undefined),
  targetFilamentType: z.string().max(40).optional().catch(undefined),
  targetColor: z.string().max(10).optional().catch(undefined)
});

// Zeitangaben kommen als Text (ISO) oder als Zahl (Sekunden bzw. Millisekunden).
function parseTime(value: unknown): Date | null {
  let millis = Number.NaN;
  if (typeof value === "number") {
    millis = value < 1e12 ? value * 1000 : value;
  } else if (typeof value === "string") {
    millis = Date.parse(value);
  }
  return Number.isFinite(millis) && millis > 0 ? new Date(millis) : null;
}

function toColor(value: string | undefined): string | null {
  const text = value?.trim() ?? "";
  return normalizeHexColor(text.startsWith("#") ? text : `#${text}`);
}

// Je Fach eine Zeile (mehrere Filamente aus demselben Fach werden addiert), auf ganze Gramm gerundet.
function parseFilaments(entries: unknown[]): HistoryFilament[] {
  const bySlot = new Map<number, HistoryFilament>();
  for (const entry of entries) {
    const parsed = filamentSchema.safeParse(entry);
    const slotIndex = parsed.success ? cloudSlotIndex(parsed.data.amsId, parsed.data.slotId) : null;
    if (!parsed.success || slotIndex === null) {
      continue;
    }
    const { weight, targetFilamentType, filamentType, targetColor } = parsed.data;
    const known = bySlot.get(slotIndex);
    bySlot.set(slotIndex, {
      slotIndex,
      weightG: (known?.weightG ?? 0) + weight,
      material: known?.material || targetFilamentType?.trim() || filamentType?.trim() || "",
      colorHex: known?.colorHex ?? toColor(targetColor)
    });
  }
  return [...bySlot.values()].map((filament) => ({ ...filament, weightG: Math.round(filament.weightG) })).filter((filament) => filament.weightG > 0);
}

function parseTask(entry: unknown): HistoryTask | null {
  const parsed = taskSchema.safeParse(entry);
  if (!parsed.success) {
    return null;
  }
  const { id, deviceId, title, designTitle, startTime, endTime, amsDetailMapping } = parsed.data;
  const finishedAt = parseTime(endTime) ?? parseTime(startTime);
  const filaments = parseFilaments(amsDetailMapping);
  if (!finishedAt || filaments.length === 0) {
    return null;
  }
  const name = (designTitle?.trim() || title?.trim() || "Druckauftrag").slice(0, MAX_NAME_LENGTH);
  return { id: String(id), serialNumber: deviceId.trim().toUpperCase(), name, startedAt: parseTime(startTime) ?? finishedAt, finishedAt, filaments };
}

export function parseTaskHistory(raw: readonly unknown[]): ParsedHistory {
  const result: ParsedHistory = { finished: [], notFinished: 0, unreadable: 0 };
  for (const entry of raw) {
    const status = statusSchema.safeParse(entry);
    if (status.success && status.data.status !== STATUS_SUCCESS) {
      result.notFinished += 1;
      continue;
    }
    const task = status.success ? parseTask(entry) : null;
    if (task) {
      result.finished.push(task);
    } else {
      result.unreadable += 1;
    }
  }
  return result;
}
