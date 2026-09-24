import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/prisma.js";
import { createSession, hashPassword } from "../../src/services/authService.js";
import { authenticateSocket, parseCookieHeader } from "../../src/socket.js";

type FakeSocket = Parameters<typeof authenticateSocket>[0];

function fakeSocket(cookie: string | undefined): FakeSocket {
  return { handshake: { headers: { cookie } }, data: {} } as unknown as FakeSocket;
}

function run(cookie: string | undefined): Promise<{ error?: Error; socket: FakeSocket }> {
  const socket = fakeSocket(cookie);
  return new Promise((resolve) => {
    void authenticateSocket(socket, (error) => resolve({ error, socket }));
  });
}

describe("Socket.IO-Anmeldung - Negativ-Tests", () => {
  let goodToken = "";
  let pendingToken = "";

  before(async () => {
    await prisma.user.deleteMany();
    const good = await prisma.user.create({
      data: { username: "sockuser", email: "sock@example.test", passwordHash: await hashPassword("correct-horse-battery-staple"), role: "USER", mustChangePassword: false }
    });
    const pending = await prisma.user.create({
      data: { username: "sockpending", email: "sockp@example.test", passwordHash: await hashPassword("correct-horse-battery-staple"), role: "USER", mustChangePassword: true }
    });
    goodToken = await createSession(good.id);
    pendingToken = await createSession(pending.id);
  });

  after(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("lehnt eine Verbindung ohne Cookie ab", async () => {
    assert.equal((await run(undefined)).error?.message, "UNAUTHORIZED");
  });

  it("lehnt ein unbekanntes Session-Token ab", async () => {
    assert.equal((await run("fp_session=gibt-es-nicht")).error?.message, "UNAUTHORIZED");
  });

  it("lehnt einen Benutzer mit ausstehendem Passwortwechsel ab", async () => {
    assert.equal((await run(`fp_session=${pendingToken}`)).error?.message, "UNAUTHORIZED");
  });

  it("lehnt ein anderes Cookie mit gueltigem Token-Wert ab", async () => {
    assert.equal((await run(`other=${goodToken}`)).error?.message, "UNAUTHORIZED");
  });

  it("laesst eine gueltige Sitzung zu und merkt sich das Token", async () => {
    const { error, socket } = await run(`theme=dark; fp_session=${goodToken}`);
    assert.equal(error, undefined);
    assert.equal(socket.data.sessionToken, goodToken);
  });

  it("liest Cookies robust (kaputte Kodierung, leere Werte)", () => {
    const cookies = parseCookieHeader("a=1; b=%E0%A4%A; c=; =x");
    assert.equal(cookies.get("a"), "1");
    assert.equal(cookies.has("b"), false);
    assert.equal(cookies.get("c"), "");
  });
});
