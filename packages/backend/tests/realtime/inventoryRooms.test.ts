import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyInventoryRooms, inventoryRoom } from "../../src/socket.js";

interface FakeSocket {
  rooms: Set<string>;
  join: (room: string) => void;
  leave: (room: string) => void;
}

function fakeSocket(initial: string[]): FakeSocket {
  const rooms = new Set(initial);
  return { rooms, join: (room) => void rooms.add(room), leave: (room) => void rooms.delete(room) };
}

describe("Socket.IO: Lager-Raeume folgen der Mitgliedschaft", () => {
  it("tritt den Raeumen der eigenen Lager bei und laesst die Verbindungs-ID unberuehrt", () => {
    const socket = fakeSocket(["verbindungs-id"]);
    applyInventoryRooms(socket as never, ["a", "b"]);
    assert.deepEqual([...socket.rooms].sort(), ["inventory:a", "inventory:b", "verbindungs-id"]);
  });

  it("verlaesst Lager, in denen der Benutzer nicht mehr Mitglied ist, und tritt neuen bei", () => {
    const socket = fakeSocket(["verbindungs-id", inventoryRoom("alt"), inventoryRoom("bleibt")]);
    applyInventoryRooms(socket as never, ["bleibt", "neu"]);
    assert.deepEqual([...socket.rooms].sort(), ["inventory:bleibt", "inventory:neu", "verbindungs-id"]);
  });

  it("ohne Mitgliedschaften bleibt kein Lager-Raum uebrig", () => {
    const socket = fakeSocket(["verbindungs-id", inventoryRoom("x")]);
    applyInventoryRooms(socket as never, []);
    assert.deepEqual([...socket.rooms], ["verbindungs-id"]);
  });
});
