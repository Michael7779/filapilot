import type { Prisma, User } from "@prisma/client";
import {
  DEFAULT_INVENTORY_NAME,
  type CreateInventoryInput,
  type Inventory,
  type InventoryMember,
  type InventoryRole,
  type MemberCandidate,
  type UpdateInventoryInput
} from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { AppError } from "../lib/apiResult.js";
import { disconnectPrinter } from "./printerRuntime.js";
import { deletePhoto } from "./spoolPhotoService.js";

type Actor = Pick<User, "id" | "role">;

let running: Promise<void> | null = null;

// Legt beim ersten Start (und nach dem Einspielen einer alten Sicherung) das "Hauptlager" an, macht alle bestehenden
// Benutzer zu Mitgliedern (Admins als Besitzer, alle anderen als Bearbeiter) und ordnet Spulen und Drucker ohne Lager
// dem aeltesten Lager zu. Wiederholbar ohne Wirkung.
async function seedDefaultInventory(): Promise<void> {
  let first = await prisma.inventory.findFirst({ orderBy: { createdAt: "asc" } });
  if (!first) {
    const users = await prisma.user.findMany({ select: { id: true, role: true } });
    first = await prisma.inventory.create({
      data: {
        name: DEFAULT_INVENTORY_NAME,
        members: { create: users.map((user) => ({ userId: user.id, role: user.role === "ADMIN" ? "OWNER" : "EDITOR" })) }
      }
    });
    logger.info("Hauptlager angelegt", { members: users.length });
  }
  const [spools, printers] = await Promise.all([
    prisma.spool.updateMany({ where: { inventoryId: null }, data: { inventoryId: first.id } }),
    prisma.printer.updateMany({ where: { inventoryId: null }, data: { inventoryId: first.id } })
  ]);
  if (spools.count > 0 || printers.count > 0) {
    logger.info("Spulen und Drucker dem Hauptlager zugeordnet", { spools: spools.count, printers: printers.count });
  }
}

export function ensureDefaultInventory(): Promise<void> {
  running ??= seedDefaultInventory().finally(() => {
    running = null;
  });
  return running;
}

const INVENTORY_LIST_INCLUDE = {
  _count: { select: { spools: true, printers: true, members: true } }
} satisfies Prisma.InventoryInclude;

function toInventory(
  row: Prisma.InventoryGetPayload<{ include: typeof INVENTORY_LIST_INCLUDE }>,
  role: InventoryRole
): Inventory {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    role,
    spoolCount: row._count.spools,
    printerCount: row._count.printers,
    memberCount: row._count.members
  };
}

export async function listInventories(user: Actor): Promise<Inventory[]> {
  if (user.role === "ADMIN") {
    const rows = await prisma.inventory.findMany({ include: INVENTORY_LIST_INCLUDE, orderBy: { name: "asc" } });
    return rows.map((row) => toInventory(row, "OWNER"));
  }
  const memberships = await prisma.inventoryMember.findMany({
    where: { userId: user.id },
    include: { inventory: { include: INVENTORY_LIST_INCLUDE } }
  });
  return memberships
    .map((membership) => toInventory(membership.inventory, membership.role))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function getInventoryRow(id: string): Promise<{ id: string; name: string; color: string }> {
  const row = await prisma.inventory.findUnique({ where: { id }, select: { id: true, name: true, color: true } });
  if (!row) {
    throw new AppError("NOT_FOUND", "Lager wurde nicht gefunden.");
  }
  return row;
}

async function assertNameFree(name: string, exceptId?: string): Promise<void> {
  const clash = await prisma.inventory.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true }
  });
  if (clash) {
    throw new AppError("CONFLICT", "Ein Lager mit diesem Namen gibt es schon.");
  }
}

export async function createInventory(user: Actor, input: CreateInventoryInput): Promise<Inventory> {
  await assertNameFree(input.name);
  const created = await prisma.inventory.create({
    data: { name: input.name, color: input.color, members: { create: { userId: user.id, role: "OWNER" } } },
    include: INVENTORY_LIST_INCLUDE
  });
  return toInventory(created, "OWNER");
}

export async function updateInventory(id: string, input: UpdateInventoryInput): Promise<{ id: string; name: string; color: string }> {
  if (input.name !== undefined) {
    await assertNameFree(input.name, id);
  }
  return prisma.inventory.update({
    where: { id },
    data: { ...(input.name !== undefined && { name: input.name }), ...(input.color !== undefined && { color: input.color }) },
    select: { id: true, name: true, color: true }
  });
}

export interface DeletedInventorySummary {
  spools: number;
  printers: number;
}

// Loescht ein Lager samt Inhalt (Druckauftraege, AMS-Zuordnungen, Spulen, Drucker, Mitgliedschaften) in EINER
// Transaktion - schlaegt etwas fehl, bleibt alles unveraendert. Foto-Dateien und Drucker-Verbindungen werden erst
// nach dem erfolgreichen Loeschen aufgeraeumt.
export async function deleteInventoryWithContents(id: string): Promise<DeletedInventorySummary> {
  const [spools, printers] = await Promise.all([
    prisma.spool.findMany({ where: { inventoryId: id }, select: { id: true } }),
    prisma.printer.findMany({ where: { inventoryId: id }, select: { id: true } })
  ]);
  const spoolIds = spools.map((spool) => spool.id);
  const printerIds = printers.map((printer) => printer.id);

  await prisma.$transaction([
    prisma.printJob.deleteMany({ where: { OR: [{ spoolId: { in: spoolIds } }, { printerId: { in: printerIds } }] } }),
    prisma.amsSlotAssignment.deleteMany({ where: { OR: [{ spoolId: { in: spoolIds } }, { printerId: { in: printerIds } }] } }),
    prisma.spool.deleteMany({ where: { inventoryId: id } }),
    prisma.printer.deleteMany({ where: { inventoryId: id } }),
    prisma.inventory.delete({ where: { id } })
  ]);

  for (const printerId of printerIds) {
    disconnectPrinter(printerId);
  }
  for (const spoolId of spoolIds) {
    await deletePhoto(spoolId);
  }
  return { spools: spoolIds.length, printers: printerIds.length };
}

export async function listMembers(inventoryId: string): Promise<InventoryMember[]> {
  const rows = await prisma.inventoryMember.findMany({
    where: { inventoryId },
    include: { user: { select: { username: true } } }
  });
  return rows
    .map((row) => ({ userId: row.userId, username: row.user.username, role: row.role }))
    .sort((a, b) => a.username.localeCompare(b.username, "de"));
}

export async function listMemberCandidates(inventoryId: string): Promise<MemberCandidate[]> {
  const users = await prisma.user.findMany({
    where: { inventoryMemberships: { none: { inventoryId } } },
    select: { id: true, username: true }
  });
  return users.sort((a, b) => a.username.localeCompare(b.username, "de"));
}

export async function addMember(inventoryId: string, userId: string, role: InventoryRole): Promise<InventoryMember> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
  if (!user) {
    throw new AppError("NOT_FOUND", "Benutzer wurde nicht gefunden.");
  }
  const existing = await prisma.inventoryMember.findUnique({
    where: { inventoryId_userId: { inventoryId, userId } },
    select: { id: true }
  });
  if (existing) {
    throw new AppError("CONFLICT", "Dieser Benutzer ist schon Mitglied.");
  }
  await prisma.inventoryMember.create({ data: { inventoryId, userId, role } });
  return { userId, username: user.username, role };
}

async function assertNotLastOwner(inventoryId: string, userId: string): Promise<void> {
  const member = await prisma.inventoryMember.findUnique({
    where: { inventoryId_userId: { inventoryId, userId } },
    select: { role: true }
  });
  if (member?.role !== "OWNER") {
    return;
  }
  const owners = await prisma.inventoryMember.count({ where: { inventoryId, role: "OWNER" } });
  if (owners <= 1) {
    throw new AppError("CONFLICT", "Das Lager braucht mindestens einen Besitzer.");
  }
}

export async function changeMemberRole(inventoryId: string, userId: string, role: InventoryRole): Promise<InventoryMember> {
  const current = await prisma.inventoryMember.findUnique({
    where: { inventoryId_userId: { inventoryId, userId } },
    include: { user: { select: { username: true } } }
  });
  if (!current) {
    throw new AppError("NOT_FOUND", "Mitglied wurde nicht gefunden.");
  }
  if (role !== "OWNER") {
    await assertNotLastOwner(inventoryId, userId);
  }
  await prisma.inventoryMember.update({ where: { inventoryId_userId: { inventoryId, userId } }, data: { role } });
  return { userId, username: current.user.username, role };
}

export async function removeMember(inventoryId: string, userId: string): Promise<{ username: string }> {
  const current = await prisma.inventoryMember.findUnique({
    where: { inventoryId_userId: { inventoryId, userId } },
    include: { user: { select: { username: true } } }
  });
  if (!current) {
    throw new AppError("NOT_FOUND", "Mitglied wurde nicht gefunden.");
  }
  await assertNotLastOwner(inventoryId, userId);
  await prisma.inventoryMember.delete({ where: { inventoryId_userId: { inventoryId, userId } } });
  return { username: current.user.username };
}
