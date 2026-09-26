import type { Server as HttpServer } from "node:http";
import { Server as SocketIoServer, type Socket } from "socket.io";
import type { PrinterLiveStatus } from "@filapilot/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { SESSION_COOKIE_NAME } from "./middleware/auth.js";
import { findUserBySessionToken } from "./services/authService.js";
import { accessibleInventoryIds } from "./services/inventoryAccess.js";

// Threat-Model: Ohne Pruefung bekaeme jeder, der den Socket.IO-Endpunkt erreicht, die Live-Status-Broadcasts der
// Drucker (Druckname, Fortschritt) - auch anonym, mit abgelaufener Sitzung oder ohne Mitgliedschaft im Lager des
// Druckers. Serverseitig erzwungen: beim Verbindungsaufbau wird das Session-Cookie geprueft (gueltig, nicht abgelaufen,
// kein ausstehender Pflicht-Passwortwechsel); der Status eines Druckers geht nur in den Raum seines Lagers, dem eine
// Verbindung nur beitritt, wenn der Benutzer dort Mitglied (oder Admin) ist; jede Minute und nach jeder Aenderung der
// Mitglieder werden Verbindungen und Raeume neu abgeglichen. Negativ-Tests: kein Cookie, falsches Token, Passwortwechsel
// offen -> abgelehnt; Raeume folgen der Mitgliedschaft.

const REVALIDATE_INTERVAL_MS = 60_000;
const ROOM_PREFIX = "inventory:";

let io: SocketIoServer | undefined;

export function inventoryRoom(inventoryId: string): string {
  return `${ROOM_PREFIX}${inventoryId}`;
}

export function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      const name = part.slice(0, separator).trim();
      try {
        cookies.set(name, decodeURIComponent(part.slice(separator + 1).trim()));
      } catch {
        // Ungueltig kodierter Cookie-Wert: wie "nicht vorhanden" behandeln.
      }
    }
  }
  return cookies;
}

// Liefert das Session-Token, wenn dahinter ein gueltiger Benutzer ohne offenen Passwortwechsel steht.
async function validSessionToken(cookieHeader: string | undefined): Promise<string | null> {
  const token = parseCookieHeader(cookieHeader).get(SESSION_COOKIE_NAME);
  if (!token) {
    return null;
  }
  const user = await findUserBySessionToken(token);
  return user && !user.mustChangePassword ? token : null;
}

export async function authenticateSocket(
  socket: Pick<Socket, "handshake" | "data">,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const token = await validSessionToken(socket.handshake.headers.cookie);
    if (!token) {
      next(new Error("UNAUTHORIZED"));
      return;
    }
    socket.data.sessionToken = token;
    next();
  } catch (err) {
    logger.error("Socket.IO-Anmeldepruefung fehlgeschlagen", { err });
    next(new Error("INTERNAL_ERROR"));
  }
}

// Bringt die Raeume einer Verbindung auf den Stand der Mitgliedschaften: tritt neuen Lagern bei, verlaesst
// Lager ohne Zugriff. Andere Raeume (z.B. die eigene Verbindungs-ID) bleiben unberuehrt.
export function applyInventoryRooms(
  socket: Pick<Socket, "rooms" | "join" | "leave">,
  inventoryIds: readonly string[]
): void {
  const wanted = new Set(inventoryIds.map((id) => inventoryRoom(id)));
  for (const room of [...socket.rooms]) {
    if (room.startsWith(ROOM_PREFIX) && !wanted.has(room)) {
      void socket.leave(room);
    }
  }
  for (const room of wanted) {
    if (!socket.rooms.has(room)) {
      void socket.join(room);
    }
  }
}

async function syncSocket(socket: Socket): Promise<void> {
  const token: unknown = socket.data.sessionToken;
  const user = typeof token === "string" ? await findUserBySessionToken(token) : null;
  if (!user || user.mustChangePassword) {
    socket.disconnect(true);
    return;
  }
  applyInventoryRooms(socket, await accessibleInventoryIds(user));
}

// Prueft alle Verbindungen erneut (Sitzung noch gueltig?) und gleicht ihre Lager-Raeume ab. Wird jede Minute und
// nach jeder Aenderung an Lagern oder Mitgliedern aufgerufen.
export async function refreshSocketAccess(): Promise<void> {
  if (!io) {
    return;
  }
  for (const socket of io.of("/").sockets.values()) {
    try {
      await syncSocket(socket);
    } catch (err) {
      // Bei einem Datenbankfehler die Verbindung lieber nicht kappen, aber laut loggen.
      logger.error("Socket.IO-Sitzung konnte nicht erneut geprueft werden", { err });
    }
  }
}

export function attachSocketServer(httpServer: HttpServer): SocketIoServer {
  io = new SocketIoServer(httpServer, {
    cors: { origin: env.FRONTEND_ORIGIN, credentials: true }
  });
  const server = io;
  server.use((socket, next) => void authenticateSocket(socket, next));
  server.on("connection", (socket) => {
    syncSocket(socket).catch((err: unknown) => {
      logger.error("Socket.IO-Raeume konnten nicht gesetzt werden", { err });
      socket.disconnect(true);
    });
  });
  setInterval(() => void refreshSocketAccess(), REVALIDATE_INTERVAL_MS).unref();
  return server;
}

// Der Status geht nur an Verbindungen, die dem Lager des Druckers angehoeren.
export function broadcastPrinterStatus(status: PrinterLiveStatus, inventoryId: string | null): void {
  if (inventoryId) {
    io?.to(inventoryRoom(inventoryId)).emit("printer:status", status);
  }
}
