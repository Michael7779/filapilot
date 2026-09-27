import { z } from "zod";

export const printerSyncModeSchema = z.enum(["LIVE", "PERIODIC"]);
export type PrinterSyncMode = z.infer<typeof printerSyncModeSchema>;

export const printerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  ipAddress: z.string().ip(),
  serialNumber: z.string().min(1).max(60),
  accessCode: z.string().min(1).max(60),
  syncMode: printerSyncModeSchema,
  syncIntervalSeconds: z.number().int().min(10).max(3600),
  inventoryId: z.string().uuid().nullable(),
  createdAt: z.coerce.date()
});
export type Printer = z.infer<typeof printerSchema>;

// Oeffentliche Sicht ohne accessCode - der Access-Code ist das Passwort des Druckers und geht
// nie an den Client zurueck, nur einmalig beim Anlegen/Aendern vom Client zum Server (siehe
// CLAUDE.md: "DB-Felder explizit gemappt, kein ganzes DB-Objekt an Client").
export const printerPublicSchema = printerSchema.omit({ accessCode: true });
export type PrinterPublic = z.infer<typeof printerPublicSchema>;

// Beim Anlegen ist das Lager Pflicht; ein Drucker gehoert fest zu genau einem Lager und wird nicht verschoben.
export const createPrinterInputSchema = printerSchema
  .omit({ id: true, createdAt: true, inventoryId: true })
  .extend({ inventoryId: z.string().uuid() });
export type CreatePrinterInput = z.infer<typeof createPrinterInputSchema>;

export const updatePrinterInputSchema = createPrinterInputSchema.omit({ inventoryId: true }).partial();
export type UpdatePrinterInput = z.infer<typeof updatePrinterInputSchema>;

// Bambu meldet die extern (nicht in der AMS) eingelegte Spule unter dieser festen Kennung ("vt_tray").
export const EXTERNAL_AMS_SLOT_INDEX = 254;

export const amsSlotStatusSchema = z.object({
  slotIndex: z.number().int().refine((value) => (value >= 0 && value <= 3) || value === EXTERNAL_AMS_SLOT_INDEX, "Ungueltiger Slot"),
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
  amsSlots: z.array(amsSlotStatusSchema)
});
export type PrinterLiveStatus = z.infer<typeof printerLiveStatusSchema>;

// Ein AMS-Slot (bzw. die externe Spule) aus Sicht der Oberflaeche: Rohangaben des Druckers + die zugeordnete FilaPilot-Spule.
export const amsSlotViewSchema = z.object({
  slotIndex: z.number().int(),
  reportedMaterial: z.string().nullable(),
  reportedColorHex: z.string().nullable(),
  remainingPercent: z.number().min(0).max(100).nullable(),
  spoolId: z.string().uuid().nullable(),
  spoolLabel: z.string().nullable()
});
export type AmsSlotView = z.infer<typeof amsSlotViewSchema>;

// Setzen/Entfernen: null loest die Zuordnung.
export const assignAmsSlotInputSchema = z.object({ spoolId: z.string().uuid().nullable() });
export type AssignAmsSlotInput = z.infer<typeof assignAmsSlotInputSchema>;
