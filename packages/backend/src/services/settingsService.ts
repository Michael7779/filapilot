import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { encryptSecret, decryptSecret } from "../lib/secretCrypto.js";
import type { Settings, SmtpConfig, UpdateSettingsInput } from "@filapilot/shared";

async function ensureRow() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, backupFolderPath: env.BACKUP_FOLDER_PATH }
  });
}

export async function getSettings(): Promise<Settings> {
  const row = await ensureRow();
  const smtp: SmtpConfig | null =
    row.smtpHost && row.smtpPort && row.smtpUsername && row.smtpFromAddress
      ? {
          host: row.smtpHost,
          port: row.smtpPort,
          secure: row.smtpSecure,
          username: row.smtpUsername,
          fromAddress: row.smtpFromAddress
        }
      : null;

  return {
    photoUploadEnabled: row.photoUploadEnabled,
    defaultPrinterSyncIntervalSeconds: row.defaultPrinterSyncIntervalSeconds,
    smtp,
    backupFolderPath: row.backupFolderPath,
    backupEnabled: row.backupEnabled,
    licenseKey: row.licenseKey
  };
}

export async function getDecryptedSmtpPassword(): Promise<string | null> {
  const row = await ensureRow();
  return row.smtpPasswordEncrypted ? decryptSecret(row.smtpPasswordEncrypted) : null;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<Settings> {
  await ensureRow();
  await prisma.settings.update({
    where: { id: 1 },
    data: {
      ...(input.photoUploadEnabled !== undefined && {
        photoUploadEnabled: input.photoUploadEnabled
      }),
      ...(input.defaultPrinterSyncIntervalSeconds !== undefined && {
        defaultPrinterSyncIntervalSeconds: input.defaultPrinterSyncIntervalSeconds
      }),
      ...(input.backupFolderPath !== undefined && { backupFolderPath: input.backupFolderPath }),
      ...(input.backupEnabled !== undefined && { backupEnabled: input.backupEnabled }),
      ...(input.smtp !== undefined && {
        smtpHost: input.smtp?.host ?? null,
        smtpPort: input.smtp?.port ?? null,
        smtpSecure: input.smtp?.secure ?? true,
        smtpUsername: input.smtp?.username ?? null,
        smtpFromAddress: input.smtp?.fromAddress ?? null,
        smtpPasswordEncrypted: input.smtp?.password ? encryptSecret(input.smtp.password) : null
      })
    }
  });
  return getSettings();
}
