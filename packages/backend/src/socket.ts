import type { Server as HttpServer } from "node:http";
import { Server as SocketIoServer, type Socket } from "socket.io";
import type { PrinterLiveStatus } from "@filapilot/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { SESSION_COOKIE_NAME } from "./middleware/auth.js";
import { findUserBySessionToken } from "./services/authService.js";

// Threat-Model: Ohne Pruefung bekaeme jeder, der den Socket.IO-Endpunkt erreicht, die Live-Status-Broadcasts der
// Drucker (Druckname, Fortschritt) - auch anonym oder mit abgelaufener Sitzung. Serverseitig erzwungen: beim
// Verbindungsaufbau wird das Session-Cookie geprueft (gueltig, nicht abgelaufen, kein ausstehender Pflicht-
// Passwortwechsel), und jede Minute werden bestehende Verbindungen erneut geprueft, damit Abmelden/Widerruf
// auch laufende Verbindungen beendet. Negativ-Tests: kein Cookie, falsches Token, Passwortwechsel offen -> abgelehnt.

const REVALIDATE_INTERVAL_MS = 60_000;

let io: SocketIoServer | undefined;

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

async function revalidateConnectedSockets(server: SocketIoServer): Promise<void> {
  for (const socket of server.of("/").sockets.values()) {
    try {
      const token: unknown = socket.data.sessionToken;
      const user = typeof token === "string" ? await findUserBySessionToken(token) : null;
      if (!user || user.mustChangePassword) {
        socket.disconnect(true);
      }
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
  setInterval(() => void revalidateConnectedSockets(server), REVALIDATE_INTERVAL_MS).unref();
  return server;
}

export function broadcastPrinterStatus(status: PrinterLiveStatus): void {
  io?.emit("printer:status", status);
}
