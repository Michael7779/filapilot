import type { User } from "@prisma/client";
import type { InventoryRole } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { AppError } from "../lib/apiResult.js";

const RANK: Record<InventoryRole, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export function roleAtLeast(role: InventoryRole, minimum: InventoryRole): boolean {
  return RANK[role] >= RANK[minimum];
}

// Die Rolle eines Benutzers in einem Lager - immer aus der Datenbank berechnet, nie aus Client-Angaben.
// Admins der Installation sind in jedem (existierenden) Lager Besitzer, ohne Mitglied sein zu muessen.
export async function findInventoryRole(user: Pick<User, "id" | "role">, inventoryId: string): Promise<InventoryRole | null> {
  if (user.role === "ADMIN") {
    const exists = await prisma.inventory.findUnique({ where: { id: inventoryId }, select: { id: true } });
    return exists ? "OWNER" : null;
  }
  const membership = await prisma.inventoryMember.findUnique({
    where: { inventoryId_userId: { inventoryId, userId: user.id } },
    select: { role: true }
  });
  return membership?.role ?? null;
}

// Wirft NOT_FOUND ohne jeden Zugriff (das Lager soll fuer Fremde nicht erkennbar sein) und FORBIDDEN, wenn die Rolle
// fuer die Aktion nicht reicht.
export async function requireInventoryRole(
  user: Pick<User, "id" | "role">,
  inventoryId: string,
  minimum: InventoryRole
): Promise<InventoryRole> {
  const role = await findInventoryRole(user, inventoryId);
  if (!role) {
    throw new AppError("NOT_FOUND", "Lager wurde nicht gefunden.");
  }
  if (!roleAtLeast(role, minimum)) {
    throw new AppError("FORBIDDEN", "Dafuer fehlt die Berechtigung in diesem Lager.");
  }
  return role;
}

// Fuer Objekte (Spule, Drucker), deren Lager aus der Datenbank kommt. Ein Objekt ohne Lager (nur vor der
// Datenuebernahme moeglich) ist ausschliesslich fuer Admins erreichbar.
export async function requireAccessToObjectInventory(
  user: Pick<User, "id" | "role">,
  inventoryId: string | null,
  minimum: InventoryRole
): Promise<InventoryRole> {
  if (inventoryId === null) {
    if (user.role === "ADMIN") {
      return "OWNER";
    }
    throw new AppError("NOT_FOUND", "Eintrag wurde nicht gefunden.");
  }
  return requireInventoryRole(user, inventoryId, minimum);
}

export async function accessibleInventoryIds(user: Pick<User, "id" | "role">): Promise<string[]> {
  if (user.role === "ADMIN") {
    return (await prisma.inventory.findMany({ select: { id: true } })).map((inventory) => inventory.id);
  }
  return (await prisma.inventoryMember.findMany({ where: { userId: user.id }, select: { inventoryId: true } })).map(
    (membership) => membership.inventoryId
  );
}
