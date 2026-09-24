import { z } from "zod";

export const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1),
  fromAddress: z.string().email()
});
export type SmtpConfig = z.infer<typeof smtpConfigSchema>;

export const smtpConfigInputSchema = smtpConfigSchema.extend({
  password: z.string().min(1)
});
export type SmtpConfigInput = z.infer<typeof smtpConfigInputSchema>;

export const settingsSchema = z.object({
  photoUploadEnabled: z.boolean(),
  defaultPrinterSyncIntervalSeconds: z.number().int().min(10).max(3600),
  smtp: smtpConfigSchema.nullable(),
  backupFolderPath: z.string().min(1),
  backupEnabled: z.boolean(),
  backupRetentionCount: z.number().int().min(1).max(365),
  auditRetentionMonths: z.number().int().min(0).max(120),
  // Reserviert fuer spaeter: Freischaltung per Lizenzschluessel. Aktuell ungenutzt,
  // keine Pruef-/Gating-Logik ohne expliziten Auftrag bauen.
  licenseKey: z.string().nullable()
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsInputSchema = z
  .object({
    photoUploadEnabled: z.boolean(),
    defaultPrinterSyncIntervalSeconds: z.number().int().min(10).max(3600),
    smtp: smtpConfigInputSchema.nullable(),
    backupFolderPath: z.string().min(1),
    backupEnabled: z.boolean(),
    backupRetentionCount: z.number().int().min(1).max(365),
    auditRetentionMonths: z.number().int().min(0).max(120)
  })
  .partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;
