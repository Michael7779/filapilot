import { createServer } from "node:http";
import { attachSocketServer } from "../../src/socket.js";

export interface Emission {
  room: string;
  event: string;
  payload: unknown;
}

// Haengt den echten Socket.IO-Server an (ohne zu lauschen) und merkt sich, was an welchen Raum geschickt wuerde.
export function captureSocketEmissions(): Emission[] {
  const emissions: Emission[] = [];
  const server = attachSocketServer(createServer());
  Object.assign(server, {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
        return true;
      }
    })
  });
  return emissions;
}
