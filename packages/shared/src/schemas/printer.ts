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

export const amsSlotStatusSchema = z.object({
  slotIndex: z.number().int().min(0).max(3),
  spoolId: z.string().uuid().nullable(),
  materialName: z.string().nullable(),
  colorHex: z.string().nullable(),
  remainingPercent: z.number().min(0).max(100).nullable()
});
export type AmsSlotStatus = z.infer<typeof amsSlotStatusSchema>;

export const printerLiveStatusSchema = z.object({
  printerId: z.string().uuid(),
  connected: z.boolean(),
  printing: z.boolean(),
  currentJobName: z.string().nullable(),
  progressPercent: z.number().min(0).max(100).nullable(),
  remainingSeconds: z.number().int().min(0).nullable(),
  amsSlots: z.array(amsSlotStatusSchema)
});
export type PrinterLiveStatus = z.infer<typeof printerLiveStatusSchema>;
