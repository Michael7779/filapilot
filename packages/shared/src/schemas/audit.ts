import { z } from "zod";

export const auditActionSchema = z.enum(["CREATE", "UPDATE", "DELETE", "EVENT"]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditAreaSchema = z.enum([
  "SPOOL",
  "MATERIAL",
  "MANUFACTURER",
  "PRINTER",
  "USER",
  "SETTINGS",
  "BACKUP",
  "INVENTORY"
]);
export type AuditArea = z.infer<typeof auditAreaSchema>;

const snapshotSchema = z.record(z.string(), z.unknown()).nullable();

export const auditEntrySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.coerce.date(),
  username: z.string(),
  action: auditActionSchema,
  area: auditAreaSchema,
  entityId: z.string().nullable(),
  inventoryId: z.string().nullable(),
  inventoryName: z.string().nullable(),
  description: z.string(),
  before: snapshotSchema,
  after: snapshotSchema
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const AUDIT_PAGE_SIZES = [10, 25, 50, 100] as const;

// Query-Parameter kommen als Strings - leere Filter werden zu undefined.
const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => (value ? value : undefined));

export const auditQuerySchema = z.object({
  search: optionalText,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  area: auditAreaSchema.optional(),
  action: auditActionSchema.optional(),
  username: optionalText,
  inventoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (AUDIT_PAGE_SIZES as readonly number[]).includes(value), "Ungueltige Seitengroesse")
    .default(25)
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export interface AuditListResult {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  usernames: string[];
  // Lager, zu denen es Eintraege gibt (fuer die Filter-Auswahl; Name als Momentaufnahme)
  inventories: { id: string; name: string }[];
}
