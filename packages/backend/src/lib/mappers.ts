import type {
  User,
  Spool as PrismaSpool,
  Material as PrismaMaterial,
  Manufacturer as PrismaManufacturer,
  Inventory as PrismaInventory,
  Printer as PrismaPrinter
} from "@prisma/client";
import type {
  UserPublic,
  Material,
  Manufacturer,
  Spool,
  SpoolWithRelations,
  PrinterPublic
} from "@filapilot/shared";

// Mappt explizit Feld fuer Feld - nie ein rohes Prisma-Objekt an den Client (kein passwordHash,
// kein resetToken).
export function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    themeAccentColor: user.themeAccentColor,
    lastLoginAt: user.lastLoginAt,
    lastActiveAt: user.lastActiveAt,
    createdAt: user.createdAt
  };
}

export function toPublicMaterial(material: PrismaMaterial): Material {
  return {
    id: material.id,
    name: material.name,
    printTempMinC: material.printTempMinC,
    printTempMaxC: material.printTempMaxC,
    bedTempC: material.bedTempC,
    manufacturerId: material.manufacturerId
  };
}

export function toPublicManufacturer(manufacturer: PrismaManufacturer): Manufacturer {
  return {
    id: manufacturer.id,
    name: manufacturer.name
  };
}

export function toPublicSpool(spool: PrismaSpool): Spool {
  return {
    id: spool.id,
    materialId: spool.materialId,
    manufacturerId: spool.manufacturerId,
    inventoryId: spool.inventoryId,
    colorName: spool.colorName,
    colorHex: spool.colorHex,
    initialWeightG: spool.initialWeightG,
    remainingWeightG: spool.remainingWeightG,
    photoUrl: spool.photoUrl,
    purchasePriceCents: spool.purchasePriceCents,
    purchasedAt: spool.purchasedAt,
    location: spool.location,
    archivedAt: spool.archivedAt,
    archiveReason: spool.archiveReason,
    createdAt: spool.createdAt
  };
}

// Nie accessCode mitschicken - das ist das Passwort des Druckers.
export function toPublicPrinter(printer: PrismaPrinter): PrinterPublic {
  return {
    id: printer.id,
    name: printer.name,
    ipAddress: printer.ipAddress,
    serialNumber: printer.serialNumber,
    syncMode: printer.syncMode,
    syncIntervalSeconds: printer.syncIntervalSeconds,
    inventoryId: printer.inventoryId,
    createdAt: printer.createdAt
  };
}

export function toPublicSpoolWithRelations(
  spool: PrismaSpool & { material: PrismaMaterial; manufacturer: PrismaManufacturer; inventory: PrismaInventory | null }
): SpoolWithRelations {
  return {
    ...toPublicSpool(spool),
    materialName: spool.material.name,
    manufacturerName: spool.manufacturer.name,
    inventoryName: spool.inventory?.name ?? null
  };
}
