import { spoolPageSizeSchema, spoolViewSchema } from "@filapilot/shared";
import type { Prisma } from "@prisma/client";
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
  PrinterPublic,
  CustomFieldValues
} from "@filapilot/shared";

// Spool.customFields kommt aus der DB als Prisma.JsonValue - immer als flaches Objekt geschrieben (siehe
// validateCustomFieldValues), aber defensiv geprueft statt blind gecastet.
function toCustomFieldValues(json: Prisma.JsonValue): CustomFieldValues {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return {};
  }
  const result: CustomFieldValues = {};
  for (const [key, value] of Object.entries(json)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    }
  }
  return result;
}

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
    spoolView: spoolViewSchema.nullable().catch(null).parse(user.spoolView),
    spoolPageSize: spoolPageSizeSchema.nullable().catch(null).parse(user.spoolPageSize),
    lastSeenChangelogVersion: user.lastSeenChangelogVersion,
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
    bedTempMaxC: material.bedTempMaxC,
    densityGCm3: material.densityGCm3,
    filamentDiameterMm: material.filamentDiameterMm,
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
    colorHex2: spool.colorHex2,
    initialWeightG: spool.initialWeightG,
    remainingWeightG: spool.remainingWeightG,
    tareWeightG: spool.tareWeightG,
    photoUrl: spool.photoUrl,
    purchasePriceCents: spool.purchasePriceCents,
    purchasedAt: spool.purchasedAt,
    location: spool.location,
    note: spool.note,
    customFields: toCustomFieldValues(spool.customFields),
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
