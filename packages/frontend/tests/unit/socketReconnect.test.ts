import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reviveSocket } from "../../src/lib/socket.js";

function fake(active: boolean) {
  const socket = {
    active,
    connects: 0,
    connect() {
      socket.connects += 1;
    }
  };
  return socket;
}

describe("reviveSocket - vom Server getrennte Live-Verbindung", () => {
  it("verbindet neu, wenn der Client nicht mehr von selbst verbindet (z.B. nach Ab- und Anmelden)", () => {
    const socket = fake(false);
    reviveSocket(socket);
    assert.equal(socket.connects, 1);
  });

  it("laesst eine aktive Verbindung in Ruhe", () => {
    const socket = fake(true);
    reviveSocket(socket);
    assert.equal(socket.connects, 0);
  });
});
