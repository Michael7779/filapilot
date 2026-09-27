import { z } from "zod";

export const materialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  // null = allgemeines Material fuer jeden Hersteller
  manufacturerId: z.string().uuid().nullable(),
  printTempMinC: z.number().int().min(0).max(400),
  printTempMaxC: z.number().int().min(0).max(400),
  bedTempC: z.number().int().min(0).max(150).nullable(),
  // Oberes Ende eines Bett-Temperatur-Bereichs; null = weiterhin nur ein Einzelwert (bedTempC).
  bedTempMaxC: z.number().int().min(0).max(150).nullable(),
  // g/cm3, fuer die ungefaehre Restlaengen-Anzeige der Spule; typische Herstellerangabe, keine garantierte Messung.
  densityGCm3: z.number().positive().max(10).nullable(),
  // mm, fast immer 1,75 (selten 2,85) - ebenfalls fuer die Restlaengen-Naeherung.
  filamentDiameterMm: z.number().positive().max(10)
});
export type Material = z.infer<typeof materialSchema>;

const materialInputBase = materialSchema.omit({ id: true });

export const createMaterialInputSchema = materialInputBase.extend({
  manufacturerId: z.string().uuid().nullable().default(null),
  densityGCm3: z.number().positive().max(10).nullable().default(null),
  filamentDiameterMm: z.number().positive().max(10).default(1.75),
  bedTempMaxC: z.number().int().min(0).max(150).nullable().optional().default(null)
});
export type CreateMaterialInput = z.infer<typeof createMaterialInputSchema>;

export const updateMaterialInputSchema = materialInputBase.partial();
export type UpdateMaterialInput = z.infer<typeof updateMaterialInputSchema>;
