import type { User, Spool as PrismaSpool, Material as PrismaMaterial } from "@prisma/client";
import type { UserPublic, Material, Spool, SpoolWithMaterial } from "@filapilot/shared";

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
    createdAt: user.createdAt
  };
}

export function toPublicMaterial(material: PrismaMaterial): Material {
  return {
    id: material.id,
    name: material.name,
    printTempMinC: material.printTempMinC,
    printTempMaxC: material.printTempMaxC,
    bedTempC: material.bedTempC
  };
}

export function toPublicSpool(spool: PrismaSpool): Spool {
  return {
    id: spool.id,
    materialId: spool.materialId,
    manufacturer: spool.manufacturer,
    colorName: spool.colorName,
    colorHex: spool.colorHex,
    initialWeightG: spool.initialWeightG,
    remainingWeightG: spool.remainingWeightG,
    photoUrl: spool.photoUrl,
    purchasePriceCents: spool.purchasePriceCents,
    purchasedAt: spool.purchasedAt,
    location: spool.location,
    createdAt: spool.createdAt
  };
}

export function toPublicSpoolWithMaterial(
  spool: PrismaSpool & { material: PrismaMaterial }
): SpoolWithMaterial {
  return {
    ...toPublicSpool(spool),
    materialName: spool.material.name
  };
}
