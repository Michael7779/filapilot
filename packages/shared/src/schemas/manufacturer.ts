import { z } from "zod";

export const manufacturerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60)
});
export type Manufacturer = z.infer<typeof manufacturerSchema>;

export const createManufacturerInputSchema = manufacturerSchema.omit({ id: true });
export type CreateManufacturerInput = z.infer<typeof createManufacturerInputSchema>;
