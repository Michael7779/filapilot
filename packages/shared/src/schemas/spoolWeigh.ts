import { z } from "zod";

// "Wiegen": man legt die Spule auf die Waage und gibt nur das Gesamtgewicht ein - der Server zieht das
// hinterlegte Leergewicht (Spool.tareWeightG) ab und setzt das Restgewicht. Vernuenftige Obergrenze (10 kg)
// gegen Vertipper, keine Untergrenze ausser 0 (eine leere Spule wiegt genau ihr Leergewicht).
export const createWeighInputSchema = z.object({
  measuredWeightG: z.number().int().min(0).max(10_000)
});
export type CreateWeighInput = z.infer<typeof createWeighInputSchema>;
