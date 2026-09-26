import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import type { AuditAction, AuditArea, AuditQuery, AuditListResult } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { getAuthenticatedUser } from "../middleware/auth.js";

export type Snapshot = Record<string, unknown>;

export interface AuditActor {
  id: string | null;
  username: string;
}

export interface AuditEntryInput {
  actor: AuditActor;
  action: AuditAction;
  area: AuditArea;
  entityId?: string | null;
  // Lager, zu dem der Eintrag gehoert (Name als Momentaufnahme, damit er nach dem Loeschen lesbar bleibt).
  inventory?: { id: string; name: string } | null;
  description: string;
  before?: Snapshot | null;
  after?: Snapshot | null;
}

// Vorgaenge ohne Benutzer (Zeitplan, Einspielen der Vorlagen, Aufraeumen) erscheinen unter "System".
export const SYSTEM_ACTOR: AuditActor = { id: null, username: "System" };

export function actorFromRequest(req: Request): AuditActor {
  const user = getAuthenticatedUser(req);
  return { id: user.id, username: user.username };
}

// Date-Objekte und undefined sauber in JSON ueberfuehren
function toJson(snapshot: Snapshot): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
}

// Ein fehlgeschlagener Protokoll-Eintrag darf die eigentliche Aktion des Benutzers nie scheitern lassen -
// er wird laut geloggt, aber nicht weitergeworfen.
export async function recordAudit(input: AuditEntryInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.actor.id,
        username: input.actor.username,
        action: input.action,
        area: input.area,
        entityId: input.entityId ?? null,
        inventoryId: input.inventory?.id ?? null,
        inventoryName: input.inventory?.name ?? null,
        description: input.description,
        ...(input.before ? { before: toJson(input.before) } : {}),
        ...(input.after ? { after: toJson(input.after) } : {})
      }
    });
  } catch (err) {
    logger.error("Protokoll-Eintrag konnte nicht geschrieben werden", { err, input: { ...input, before: undefined, after: undefined } });
  }
}

export async function listAudit(query: AuditQuery): Promise<AuditListResult> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.area ? { area: query.area } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.username ? { username: query.username } : {}),
    ...(query.inventoryId ? { inventoryId: query.inventoryId } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { description: { contains: query.search, mode: "insensitive" } },
            { username: { contains: query.search, mode: "insensitive" } },
            { entityId: { contains: query.search, mode: "insensitive" } }
          ]
        }
      : {})
  };

  const [total, rows, names, inventoryRows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    }),
    prisma.auditLog.findMany({ distinct: ["username"], select: { username: true } }),
    prisma.auditLog.findMany({
      where: { inventoryId: { not: null } },
      distinct: ["inventoryId"],
      orderBy: { createdAt: "desc" },
      select: { inventoryId: true, inventoryName: true }
    })
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      username: row.username,
      action: row.action,
      area: row.area,
      entityId: row.entityId,
      inventoryId: row.inventoryId,
      inventoryName: row.inventoryName,
      description: row.description,
      before: (row.before as Snapshot | null) ?? null,
      after: (row.after as Snapshot | null) ?? null
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    usernames: names.map((entry) => entry.username).sort((a, b) => a.localeCompare(b, "de")),
    inventories: inventoryRows
      .flatMap((row) => (row.inventoryId ? [{ id: row.inventoryId, name: row.inventoryName ?? "" }] : []))
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
  };
}

// Protokolliert eine Aenderung nur, wenn sich wirklich etwas geaendert hat (kein Eintrag fuer "Speichern ohne Aenderung").
export async function recordUpdate(input: Omit<AuditEntryInput, "action"> & { before: Snapshot; after: Snapshot }): Promise<void> {
  if (JSON.stringify(input.before) === JSON.stringify(input.after)) {
    return;
  }
  await recordAudit({ ...input, action: "UPDATE" });
}
