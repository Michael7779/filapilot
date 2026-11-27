import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

// Nach einer Trennung durch den Server (Sitzung beendet, z.B. Abmelden) oder einer abgelehnten Anmeldung verbindet
// socket.io-client nicht von selbst neu (`active` ist dann false) - ohne Anstoss blieben die Seiten bis zum Neuladen stumm.
export function reviveSocket(target: { active: boolean; connect: () => unknown }): void {
  if (!target.active) {
    target.connect();
  }
}

// Ein einzelner geteilter Socket.IO-Client fuer die ganze App (nicht pro Seite neu verbinden).
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", withCredentials: true, autoConnect: true });
  }
  reviveSocket(socket);
  return socket;
}
