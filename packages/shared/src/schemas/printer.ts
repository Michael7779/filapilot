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
  createdAt: z.coerce.date()
});
export type Printer = z.infer<typeof printerSchema>;

export const createPrinterInputSchema = printerSchema.omit({ id: true, createdAt: true });
export type CreatePrinterInput = z.infer<typeof createPrinterInputSchema>;

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
