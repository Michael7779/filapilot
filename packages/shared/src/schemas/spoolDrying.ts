import { z } from "zod";

// Trocknungs-Protokoll einer Spule: kein eigenes DB-Modell, sondern ein EVENT im bestehenden Aenderungsprotokoll
// (area SPOOL), damit es zusammen mit Anlegen/Aendern/Cloud-Ereignissen in einem Verlauf erscheint (siehe auditService.ts).
export const createDryingLogInputSchema = z.object({
  temperatureC: z.number().int().min(1).max(150),
  durationMinutes: z.number().int().min(1).max(2880),
  note: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .default(null)
    .transform((value) => (value ? value : null))
});

export type CreateDryingLogInput = z.infer<typeof createDryingLogInputSchema>;
