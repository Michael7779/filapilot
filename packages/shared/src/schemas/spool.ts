import { z } from "zod";

export const spoolSchema = z.object({
  id: z.string().uuid(),
  materialId: z.string().uuid(),
  manufacturerId: z.string().uuid(),
  colorName: z.string().min(1).max(60),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  initialWeightG: z.number().int().positive(),
  remainingWeightG: z.number().int().min(0),
  photoUrl: z.string().url().nullable(),
  purchasePriceCents: z.number().int().min(0).nullable(),
  purchasedAt: z.coerce.date().nullable(),
  location: z.string().max(60).nullable(),
  createdAt: z.coerce.date()
});
export type Spool = z.infer<typeof spoolSchema>;

export const createSpoolInputSchema = spoolSchema.omit({ id: true, createdAt: true });
export type CreateSpoolInput = z.infer<typeof createSpoolInputSchema>;

export const updateSpoolInputSchema = createSpoolInputSchema.partial();
export type UpdateSpoolInput = z.infer<typeof updateSpoolInputSchema>;

export const spoolWithRelationsSchema = spoolSchema.extend({
  materialName: z.string(),
  manufacturerName: z.string()
});
export type SpoolWithRelations = z.infer<typeof spoolWithRelationsSchema>;

export const LOW_STOCK_THRESHOLD_RATIO = 0.15;
