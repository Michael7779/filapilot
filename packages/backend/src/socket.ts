import type { Server as HttpServer } from "node:http";
import { Server as SocketIoServer } from "socket.io";
import type { PrinterLiveStatus } from "@filapilot/shared";
import { env } from "./env.js";

let io: SocketIoServer | undefined;

export function attachSocketServer(httpServer: HttpServer): SocketIoServer {
  io = new SocketIoServer(httpServer, {
    cors: { origin: env.FRONTEND_ORIGIN, credentials: true }
  });
  return io;
}

export function broadcastPrinterStatus(status: PrinterLiveStatus): void {
  io?.emit("printer:status", status);
}
