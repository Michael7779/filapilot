import { z } from "zod";

export const printerSyncModeSchema = z.enum(["LIVE", "PERIODIC"]);
export type PrinterSyncMode = z.infer<typeof printerSyncModeSchema>;

// LOCAL: FilaPilot verbindet sich direkt mit dem MQTT-Broker des Druckers (IP + Access-Code, braucht je nach Firmware den
// LAN-Modus). CLOUD: Status kommt ueber den MQTT-Broker der Bambu Cloud, mit der Bambu-Verbindung des Lagers (kein LAN-Modus,
// keine IP, kein Access-Code).
export const printerConnectionModeSchema = z.enum(["LOCAL", "CLOUD"]);
export type PrinterConnectionMode = z.infer<typeof printerConnectionModeSchema>;

const ipAddressSchema = z.union([z.ipv4(), z.ipv6()]);
const accessCodeSchema = z.string().min(1).max(60);

export const printerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  connectionMode: printerConnectionModeSchema,
  // Nur im Modus LOCAL gesetzt (sonst null).
  ipAddress: ipAddressSchema.nullable(),
  serialNumber: z.string().min(1).max(60),
  accessCode: accessCodeSchema.nullable(),
  syncMode: printerSyncModeSchema,
  syncIntervalSeconds: z.number().int().min(10).max(3600),
  inventoryId: z.string().uuid(),
  createdAt: z.coerce.date()
});
export type Printer = z.infer<typeof printerSchema>;

// Oeffentliche Sicht ohne accessCode - der Access-Code ist das Passwort des Druckers und geht
// nie an den Client zurueck, nur einmalig beim Anlegen/Aendern vom Client zum Server (siehe
// CLAUDE.md: "DB-Felder explizit gemappt, kein ganzes DB-Objekt an Client").
export const printerPublicSchema = printerSchema.omit({ accessCode: true });
export type PrinterPublic = z.infer<typeof printerPublicSchema>;

// Gemeinsame Felder fuer Anlegen und Aendern. Hier bewusst ohne Standardwert fuer connectionMode: ein `.partial()` darauf
// wuerde den Modus sonst bei jeder Aenderung auf LOCAL zuruecksetzen.
const printerInputFields = z.object({
  name: printerSchema.shape.name,
  connectionMode: printerConnectionModeSchema,
  ipAddress: ipAddressSchema.nullish(),
  serialNumber: printerSchema.shape.serialNumber,
  accessCode: accessCodeSchema.nullish(),
  syncMode: printerSyncModeSchema,
  syncIntervalSeconds: printerSchema.shape.syncIntervalSeconds,
  inventoryId: z.string().uuid()
});

// Ein Drucker im Modus LOCAL braucht IP und Access-Code; im Modus CLOUD gehoeren beide nicht dazu.
export function printerConnectionProblem(
  mode: PrinterConnectionMode,
  ipAddress: string | null | undefined,
  accessCode: string | null | undefined
): "missingLocalCredentials" | "unexpectedLocalCredentials" | null {
  const hasLocal = Boolean(ipAddress) || Boolean(accessCode);
  if (mode === "LOCAL") {
    return ipAddress && accessCode ? null : "missingLocalCredentials";
  }
  return hasLocal ? "unexpectedLocalCredentials" : null;
}

// Beim Anlegen ist das Lager Pflicht; spaeter kann ein Besitzer beider Lager den Drucker in ein anderes Lager verschieben.
// Ohne Angabe gilt LOCAL (so wie bis 0.43.0).
export const createPrinterInputSchema = printerInputFields
  .extend({ connectionMode: printerConnectionModeSchema.default("LOCAL") })
  .superRefine((value, ctx) => {
    const problem = printerConnectionProblem(value.connectionMode, value.ipAddress, value.accessCode);
    if (problem) {
      ctx.addIssue({
        code: "custom",
        path: [problem === "missingLocalCredentials" ? "ipAddress" : "connectionMode"],
        message:
          problem === "missingLocalCredentials"
            ? "Für die lokale Verbindung sind IP-Adresse und Access-Code nötig."
            : "Bei der Verbindung über die Bambu Cloud gibt es keine IP-Adresse und keinen Access-Code."
      });
    }
  })
  .transform((value) => ({ ...value, ipAddress: value.ipAddress ?? null, accessCode: value.accessCode ?? null }));
export type CreatePrinterInput = z.infer<typeof createPrinterInputSchema>;

export const updatePrinterInputSchema = printerInputFields.partial();
export type UpdatePrinterInput = z.infer<typeof updatePrinterInputSchema>;

// Bambu meldet die extern (nicht in der AMS) eingelegte Spule unter dieser festen Kennung ("vt_tray").
export const EXTERNAL_AMS_SLOT_INDEX = 254;

// Mehrere AMS-Einheiten in Reihe: Slot-Index = Einheit * 4 + Kammer (Einheit 0-3, Kammer 0-3). Die erste Einheit behaelt damit die
// Indizes 0-3 aus den Zeiten mit nur einer AMS, bestehende Zuordnungen bleiben gueltig.
export const AMS_SLOTS_PER_UNIT = 4;
export const MAX_AMS_UNITS = 4;

export function isValidAmsSlotIndex(value: number): boolean {
  return (
    (Number.isInteger(value) && value >= 0 && value < AMS_SLOTS_PER_UNIT * MAX_AMS_UNITS) ||
    value === EXTERNAL_AMS_SLOT_INDEX
  );
}

export const amsSlotStatusSchema = z.object({
  slotIndex: z.number().int().refine(isValidAmsSlotIndex, "Ungueltiger Slot"),
  // Rohangaben des Druckers zu dieser Kammer (nicht die FilaPilot-Spule) - nur zur Anzeige/zum Abgleich beim Zuordnen.
  reportedMaterial: z.string().nullable(),
  reportedColorHex: z.string().nullable(),
  remainingPercent: z.number().min(0).max(100).nullable()
});
export type AmsSlotStatus = z.infer<typeof amsSlotStatusSchema>;

export const printStateSchema = z.enum(["idle", "running", "paused", "finished", "failed", "unknown"]);
export type PrintState = z.infer<typeof printStateSchema>;

export const printerLiveStatusSchema = z.object({
  printerId: z.string().uuid(),
  connected: z.boolean(),
  printing: z.boolean(),
  printState: printStateSchema,
  currentJobName: z.string().nullable(),
  progressPercent: z.number().min(0).max(100).nullable(),
  remainingSeconds: z.number().int().min(0).nullable(),
  amsSlots: z.array(amsSlotStatusSchema),
  // Warum ein Cloud-Drucker nicht verbindet (nur bei connectionMode CLOUD): keine Bambu-Verbindung im Lager gespeichert, oder die
  // Cloud hat das Token abgelehnt (abgelaufen). Fehlt, solange es keinen bekannten Grund gibt.
  issue: z.enum(["cloud_no_account", "cloud_rejected"]).optional()
});
export type PrinterLiveStatus = z.infer<typeof printerLiveStatusSchema>;

// Ein AMS-Slot (bzw. die externe Spule) aus Sicht der Oberflaeche: Rohangaben des Druckers + die zugeordnete FilaPilot-Spule.
export const amsSlotViewSchema = z.object({
  slotIndex: z.number().int(),
  reportedMaterial: z.string().nullable(),
  reportedColorHex: z.string().nullable(),
  remainingPercent: z.number().min(0).max(100).nullable(),
  spoolId: z.string().uuid().nullable(),
  spoolLabel: z.string().nullable(),
  // Nur gesetzt (true), wenn die Zuordnung automatisch aus der Bambu-Cloud stammt
  auto: z.boolean().optional()
});
export type AmsSlotView = z.infer<typeof amsSlotViewSchema>;

// Setzen/Entfernen: null loest die Zuordnung.
export const assignAmsSlotInputSchema = z.object({ spoolId: z.string().uuid().nullable() });
export type AssignAmsSlotInput = z.infer<typeof assignAmsSlotInputSchema>;
