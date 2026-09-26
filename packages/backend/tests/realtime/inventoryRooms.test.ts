import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyInventoryRooms, inventoryRoom } from "../../src/socket.js";

interface FakeSocket {
  rooms: Set<string>;
  join: (room: string) => Promise<void>;
  leave: (room: string) => Promise<void>;
}

function fakeSocket(initial: string[]): FakeSocket {
  const rooms = new Set(initial);
  return {
    rooms,
    join: (room) => {
      rooms.add(room);
      return Promise.resolve();
    },
    leave: (room) => {
      rooms.delete(room);
      return Promise.resolve();
    }
  };
}

describe("Socket.IO: Lager-Raeume folgen der Mitgliedschaft", () => {
  it("tritt den Raeumen der eigenen Lager bei und laesst die Verbindungs-ID unberuehrt", async () => {
    const socket = fakeSocket(["verbindungs-id"]);
    await applyInventoryRooms(socket as never, ["a", "b"]);
    assert.deepEqual([...socket.rooms].sort(), ["inventory:a", "inventory:b", "verbindungs-id"]);
  });

  it("verlaesst Lager, in denen der Benutzer nicht mehr Mitglied ist, und tritt neuen bei", async () => {
    const socket = fakeSocket(["verbindungs-id", inventoryRoom("alt"), inventoryRoom("bleibt")]);
    await applyInventoryRooms(socket as never, ["bleibt", "neu"]);
    assert.deepEqual([...socket.rooms].sort(), ["inventory:bleibt", "inventory:neu", "verbindungs-id"]);
  });

  it("ohne Mitgliedschaften bleibt kein Lager-Raum uebrig", async () => {
    const socket = fakeSocket(["verbindungs-id", inventoryRoom("x")]);
    await applyInventoryRooms(socket as never, []);
    assert.deepEqual([...socket.rooms], ["verbindungs-id"]);
  });
});
