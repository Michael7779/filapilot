import type {
  Inventory as PrismaInventory,
  Manufacturer as PrismaManufacturer,
  Material as PrismaMaterial,
  Printer as PrismaPrinter,
  Spool as PrismaSpool,
  User as PrismaUser
} from "@prisma/client";
import type { Settings } from "@filapilot/shared";
import type { Snapshot } from "../services/auditService.js";

// Momentaufnahmen fuer das Aenderungsprotokoll. Bewusst explizit Feld fuer Feld und in lesbarer Form
// (Namen statt IDs): niemals passwordHash, resetToken, Drucker-Zugangscode oder SMTP-Passwort.

export function spoolSnapshot(
  spool: PrismaSpool & { material: PrismaMaterial; manufacturer: PrismaManufacturer; inventory?: PrismaInventory | null }
): Snapshot {
  return {
    inventoryName: spool.inventory?.name ?? null,
    manufacturerName: spool.manufacturer.name,
    materialName: spool.material.name,
    colorName: spool.colorName,
    colorHex: spool.colorHex,
    initialWeightG: spool.initialWeightG,
    remainingWeightG: spool.remainingWeightG,
    location: spool.location,
    purchasePriceCents: spool.purchasePriceCents
  };
}

export function describeSpool(
  spool: PrismaSpool & { material: PrismaMaterial; manufacturer: PrismaManufacturer }
): string {
  return `${spool.manufacturer.name} ${spool.material.name} ${spool.colorName}`;
}

export function materialSnapshot(material: PrismaMaterial, manufacturerName: string | null): Snapshot {
  return {
    name: material.name,
    manufacturerName,
    printTempMinC: material.printTempMinC,
    printTempMaxC: material.printTempMaxC,
    bedTempC: material.bedTempC
  };
}

export function manufacturerSnapshot(manufacturer: PrismaManufacturer): Snapshot {
  return { name: manufacturer.name };
}

export function printerSnapshot(printer: PrismaPrinter): Snapshot {
  return {
    name: printer.name,
    ipAddress: printer.ipAddress,
    serialNumber: printer.serialNumber,
    syncMode: printer.syncMode,
    syncIntervalSeconds: printer.syncIntervalSeconds
  };
}

export function userSnapshot(user: PrismaUser): Snapshot {
  return { username: user.username, email: user.email, role: user.role };
}

export function settingsSnapshot(settings: Settings): Snapshot {
  return {
    photoUploadEnabled: settings.photoUploadEnabled,
    defaultPrinterSyncIntervalSeconds: settings.defaultPrinterSyncIntervalSeconds,
    backupEnabled: settings.backupEnabled,
    backupRetentionCount: settings.backupRetentionCount,
    auditRetentionMonths: settings.auditRetentionMonths,
    backupFolderPath: settings.backupFolderPath,
    smtpHost: settings.smtp?.host ?? null,
    smtpPort: settings.smtp?.port ?? null,
    smtpSecure: settings.smtp?.secure ?? null,
    smtpUsername: settings.smtp?.username ?? null,
    smtpFromAddress: settings.smtp?.fromAddress ?? null
  };
}
