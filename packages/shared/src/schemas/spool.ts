import { z } from "zod";

export const spoolSchema = z.object({
  id: z.string().uuid(),
  materialId: z.string().uuid(),
  manufacturerId: z.string().uuid(),
  // Lager der Spule (in der Datenbank nur wegen der Datenuebernahme optional).
  inventoryId: z.string().uuid().nullable(),
  colorName: z.string().min(1).max(60),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  initialWeightG: z.number().int().positive(),
  remainingWeightG: z.number().int().min(0),
  // Vom Server verwaltet (Upload ueber PUT /api/spools/:id/photo), nie vom Client frei setzbar.
  photoUrl: z.string().nullable(),
  purchasePriceCents: z.number().int().min(0).nullable(),
  purchasedAt: z.coerce.date().nullable(),
  location: z.string().max(60).nullable(),
  createdAt: z.coerce.date()
});
export type Spool = z.infer<typeof spoolSchema>;

// Beim Anlegen ist das Lager Pflicht; beim Aendern optional (Angabe = in dieses Lager verschieben).
export const createSpoolInputSchema = spoolSchema
  .omit({ id: true, createdAt: true, photoUrl: true, inventoryId: true })
  .extend({ inventoryId: z.string().uuid() });
export type CreateSpoolInput = z.infer<typeof createSpoolInputSchema>;

export const updateSpoolInputSchema = createSpoolInputSchema.partial();
export type UpdateSpoolInput = z.infer<typeof updateSpoolInputSchema>;

export const spoolWithRelationsSchema = spoolSchema.extend({
  materialName: z.string(),
  manufacturerName: z.string(),
  inventoryName: z.string().nullable()
});
export type SpoolWithRelations = z.infer<typeof spoolWithRelationsSchema>;

export const LOW_STOCK_THRESHOLD_RATIO = 0.15;
