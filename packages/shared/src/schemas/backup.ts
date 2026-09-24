import { z } from "zod";

// Ein Sicherungssatz: alle Dateien mit demselben Zeitstempel (z.B. 2026-09-24T01-00-00-008Z).
export const backupTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, "Ungueltiger Sicherungs-Zeitstempel");

export const backupInfoSchema = z.object({
  timestamp: backupTimestampSchema,
  createdAt: z.string(),
  hasUploads: z.boolean(),
  sizeBytes: z.number().int().min(0)
});
export type BackupInfo = z.infer<typeof backupInfoSchema>;

// Bewusst ein festes Wort: verhindert, dass ein versehentlicher API-Aufruf die Datenbank ueberschreibt.
export const RESTORE_CONFIRMATION_WORD = "WIEDERHERSTELLEN";
export const restoreBackupInputSchema = z.object({
  confirmation: z.literal(RESTORE_CONFIRMATION_WORD)
});
export type RestoreBackupInput = z.infer<typeof restoreBackupInputSchema>;

export const restoreStateSchema = z.enum(["idle", "running", "done", "failed"]);
export const restoreStepSchema = z.enum(["safety-backup", "database", "uploads", "schema", "finish"]);
export const restoreStatusSchema = z.object({
  state: restoreStateSchema,
  step: restoreStepSchema.nullable(),
  timestamp: backupTimestampSchema.nullable(),
  message: z.string().nullable()
});
export type RestoreStatus = z.infer<typeof restoreStatusSchema>;
