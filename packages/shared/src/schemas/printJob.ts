import { z } from "zod";

export const printJobSchema = z.object({
  id: z.string().uuid(),
  printerId: z.string().uuid(),
  spoolId: z.string().uuid(),
  name: z.string().min(1).max(120),
  filamentUsedG: z.number().min(0),
  // Kaufpreis-Anteil zum Zeitpunkt des Drucks (Momentaufnahme); null ohne bekannten Kaufpreis der Spule.
  costCents: z.number().int().min(0).nullable(),
  // false = der Druck ist fehlgeschlagen/abgebrochen (Material wurde trotzdem verbraucht).
  succeeded: z.boolean(),
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date().nullable()
});
export type PrintJob = z.infer<typeof printJobSchema>;

export const createPrintJobInputSchema = printJobSchema.omit({ id: true });
export type CreatePrintJobInput = z.infer<typeof createPrintJobInputSchema>;

// Auftrag mit Anzeigenamen fuer die Oberflaeche (Statistik, Spulen-Verlauf) - keine eigene Route zum Schreiben.
export const printJobWithNamesSchema = printJobSchema.extend({
  printerName: z.string(),
  spoolLabel: z.string(),
  inventoryName: z.string().nullable()
});
export type PrintJobWithNames = z.infer<typeof printJobWithNamesSchema>;

export const printJobListQuerySchema = z.object({
  inventoryId: z.union([z.literal("all"), z.string().uuid()]),
  printerId: z.string().uuid().optional(),
  spoolId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional()
});
export type PrintJobListQuery = z.infer<typeof printJobListQuerySchema>;

export interface PrintJobListResult {
  jobs: PrintJobWithNames[];
  nextCursor: string | null;
}
