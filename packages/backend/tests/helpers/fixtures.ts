import type { Express } from "express";
import request from "supertest";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

export const TEST_PASSWORD = "correct-horse-battery-staple";

export interface TestUser {
  id: string;
  username: string;
  cookie: string[];
}

// Legt einen Benutzer an und meldet ihn an. Kein Pflicht-Passwortwechsel, damit die Routen erreichbar sind.
export async function createLoggedInUser(app: Express, username: string, role: "ADMIN" | "USER" = "USER"): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@example.test`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      role,
      mustChangePassword: false
    }
  });
  const login = await request(app).post("/api/auth/login").send({ username, password: TEST_PASSWORD });
  return { id: user.id, username, cookie: login.headers["set-cookie"] as unknown as string[] };
}

// Alle Tabellen leeren, die die Lager-Tests anfassen (Reihenfolge wegen der Fremdschluessel).
export async function resetInventoryData(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.printJob.deleteMany();
  await prisma.amsSlotAssignment.deleteMany();
  await prisma.spool.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.inventoryMember.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.user.deleteMany();
}

export async function createInventoryWithMembers(
  name: string,
  members: { userId: string; role: "OWNER" | "EDITOR" | "VIEWER" }[]
): Promise<{ id: string; name: string }> {
  return prisma.inventory.create({
    data: { name, members: { create: members } },
    select: { id: true, name: true }
  });
}

export async function createCatalogEntries(): Promise<{ materialId: string; manufacturerId: string }> {
  const manufacturer = await prisma.manufacturer.upsert({
    where: { name: "Test Hersteller" },
    update: {},
    create: { name: "Test Hersteller" }
  });
  const material =
    (await prisma.material.findFirst({ where: { name: "Test PLA", manufacturerId: manufacturer.id } })) ??
    (await prisma.material.create({
      data: { name: "Test PLA", manufacturerId: manufacturer.id, printTempMinC: 190, printTempMaxC: 220, bedTempC: 60 }
    }));
  return { materialId: material.id, manufacturerId: manufacturer.id };
}

export async function createSpoolIn(
  inventoryId: string,
  colorName = "Rot",
  remainingWeightG = 800
): Promise<{ id: string }> {
  const { materialId, manufacturerId } = await createCatalogEntries();
  return prisma.spool.create({
    data: { materialId, manufacturerId, inventoryId, colorName, initialWeightG: 1000, remainingWeightG },
    select: { id: true }
  });
}

let printerCounter = 0;
export async function createPrinterIn(inventoryId: string, name = "Testdrucker"): Promise<{ id: string }> {
  printerCounter += 1;
  return prisma.printer.create({
    data: { name, ipAddress: "192.0.2.10", serialNumber: `TEST-SERIAL-${Date.now()}-${printerCounter}`, accessCode: "12345678", inventoryId },
    select: { id: true }
  });
}
