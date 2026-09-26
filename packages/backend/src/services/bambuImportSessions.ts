import { randomBytes } from "node:crypto";
import type { BambuRegion, BambuSpool } from "@filapilot/shared";
import { AppError } from "../lib/apiResult.js";

// Import-Sitzungen leben NUR im Arbeitsspeicher: das Bambu-Token wird nie in die Datenbank oder in Dateien geschrieben und
// verschwindet nach dem Import, beim Abbrechen, nach 15 Minuten oder beim Neustart des Servers.
export const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 3;

export interface ImportSession {
  id: string;
  userId: string;
  inventoryId: string;
  region: BambuRegion;
  // Nur fuer den E-Mail-Code-Schritt (das Passwort wird nie gespeichert)
  pendingAccount: string | null;
  token: string | null;
  spools: BambuSpool[] | null;
  skipped: number;
  expiresAt: number;
}

const sessions = new Map<string, ImportSession>();
let clock: () => number = () => Date.now();

export function setSessionClockForTests(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now());
}

export function clearSessionsForTests(): void {
  sessions.clear();
}

function sweep(): void {
  const now = clock();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}

export function createSession(input: {
  userId: string;
  inventoryId: string;
  region: BambuRegion;
  pendingAccount?: string | null;
  token?: string | null;
  spools?: BambuSpool[] | null;
  skipped?: number;
}): ImportSession {
  sweep();
  const own = [...sessions.values()].filter((session) => session.userId === input.userId).sort((a, b) => a.expiresAt - b.expiresAt);
  while (own.length >= MAX_SESSIONS_PER_USER) {
    const oldest = own.shift();
    if (oldest) {
      sessions.delete(oldest.id);
    }
  }
  const session: ImportSession = {
    id: randomBytes(24).toString("base64url"),
    userId: input.userId,
    inventoryId: input.inventoryId,
    region: input.region,
    pendingAccount: input.pendingAccount ?? null,
    token: input.token ?? null,
    spools: input.spools ?? null,
    skipped: input.skipped ?? 0,
    expiresAt: clock() + SESSION_TTL_MS
  };
  sessions.set(session.id, session);
  return session;
}

// Eine Sitzung gehoert genau einem Benutzer und einem Lager - sonst (auch abgelaufen) 404, ohne zu verraten, dass es sie gibt.
export function getSession(id: string, userId: string, inventoryId: string): ImportSession {
  sweep();
  const session = sessions.get(id);
  if (!session || session.userId !== userId || session.inventoryId !== inventoryId) {
    throw new AppError("NOT_FOUND", "Die Import-Sitzung wurde nicht gefunden oder ist abgelaufen. Bitte neu anmelden.");
  }
  return session;
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}
