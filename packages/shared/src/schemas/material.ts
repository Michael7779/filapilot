import { z } from "zod";

export const materialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  printTempMinC: z.number().int().min(0).max(400),
  printTempMaxC: z.number().int().min(0).max(400),
  bedTempC: z.number().int().min(0).max(150).nullable()
});
export type Material = z.infer<typeof materialSchema>;

export const createMaterialInputSchema = materialSchema.omit({ id: true });
export type CreateMaterialInput = z.infer<typeof createMaterialInputSchema>;
