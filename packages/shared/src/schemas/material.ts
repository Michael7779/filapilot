import { z } from "zod";

export const materialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  // null = allgemeines Material fuer jeden Hersteller
  manufacturerId: z.string().uuid().nullable(),
  printTempMinC: z.number().int().min(0).max(400),
  printTempMaxC: z.number().int().min(0).max(400),
  bedTempC: z.number().int().min(0).max(150).nullable()
});
export type Material = z.infer<typeof materialSchema>;

const materialInputBase = materialSchema.omit({ id: true });

export const createMaterialInputSchema = materialInputBase.extend({
  manufacturerId: z.string().uuid().nullable().default(null)
});
export type CreateMaterialInput = z.infer<typeof createMaterialInputSchema>;

export const updateMaterialInputSchema = materialInputBase.partial();
export type UpdateMaterialInput = z.infer<typeof updateMaterialInputSchema>;
