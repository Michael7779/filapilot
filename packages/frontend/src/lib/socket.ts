import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

// Ein einzelner geteilter Socket.IO-Client fuer die ganze App (nicht pro Seite neu verbinden).
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", withCredentials: true, autoConnect: true });
  }
  return socket;
}
