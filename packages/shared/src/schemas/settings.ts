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

// Automatischer Abgleich mit der Bambu-Cloud: 0 = aus, sonst mindestens alle 60 Minuten (Schutz vor Sperre durch die Cloud)
export const BAMBU_AUTO_SYNC_OPTIONS = [0, 60, 180, 360, 720, 1440] as const;
export const bambuAutoSyncMinutesSchema = z
  .number()
  .int()
  .refine((value) => (BAMBU_AUTO_SYNC_OPTIONS as readonly number[]).includes(value), "Ungueltiges Intervall");

// Wie lange eine Anmeldung gueltig bleibt (Tage), bevor sich der Nutzer neu anmelden muss.
export const SESSION_EXPIRY_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
export const sessionExpiryDaysSchema = z
  .number()
  .int()
  .refine((value) => (SESSION_EXPIRY_DAY_OPTIONS as readonly number[]).includes(value), "Ungueltige Dauer");

export const settingsSchema = z.object({
  photoUploadEnabled: z.boolean(),
  defaultPrinterSyncIntervalSeconds: z.number().int().min(10).max(3600),
  smtp: smtpConfigSchema.nullable(),
  backupFolderPath: z.string().min(1),
  backupEnabled: z.boolean(),
  backupRetentionCount: z.number().int().min(1).max(365),
  auditRetentionMonths: z.number().int().min(0).max(120),
  bambuAutoSyncMinutes: bambuAutoSyncMinutesSchema,
  sessionExpiryDays: sessionExpiryDaysSchema,
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
    auditRetentionMonths: z.number().int().min(0).max(120),
    bambuAutoSyncMinutes: bambuAutoSyncMinutesSchema,
    sessionExpiryDays: sessionExpiryDaysSchema
  })
  .partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;
