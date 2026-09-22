import { z } from "zod";

export const printJobSchema = z.object({
  id: z.string().uuid(),
  printerId: z.string().uuid(),
  spoolId: z.string().uuid(),
  name: z.string().min(1).max(120),
  filamentUsedG: z.number().min(0),
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date().nullable()
});
export type PrintJob = z.infer<typeof printJobSchema>;

export const createPrintJobInputSchema = printJobSchema.omit({ id: true });
export type CreatePrintJobInput = z.infer<typeof createPrintJobInputSchema>;
