import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/authService.js";

describe("Theming - Negativ-Tests", () => {
  const app = createApp();
  let userACookie: string[] = [];
  let userBId = "";

  before(async () => {
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        username: "themeUserA",
        email: "themeA@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "USER",
        mustChangePassword: false
      }
    });
    const userB = await prisma.user.create({
      data: {
        username: "themeUserB",
        email: "themeB@example.test",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        role: "USER",
        mustChangePassword: false,
        themeAccentColor: "#000000"
      }
    });
    userBId = userB.id;

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "themeUserA", password: "correct-horse-battery-staple" });
    userACookie = login.headers["set-cookie"];
  });

  after(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("aendert nur die eigene Akzentfarbe, auch wenn eine fremde userId mitgeschickt wird", async () => {
    const res = await request(app)
      .patch("/api/users/me/theme")
      .set("Cookie", userACookie)
      .send({ themeAccentColor: "#D85A30", userId: userBId });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.themeAccentColor, "#D85A30");
    assert.notEqual(res.body.data.id, userBId);

    const userBAfter = await prisma.user.findUniqueOrThrow({ where: { id: userBId } });
    assert.equal(userBAfter.themeAccentColor, "#000000");
  });

  it("setzt die eigene Akzentfarbe per null wieder auf Standard zurueck", async () => {
    const res = await request(app)
      .patch("/api/users/me/theme")
      .set("Cookie", userACookie)
      .send({ themeAccentColor: null });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.themeAccentColor, null);
  });

  it("lehnt Aenderung der Akzentfarbe ohne Session-Cookie ab (401)", async () => {
    const res = await request(app).patch("/api/users/me/theme").send({ themeAccentColor: "#000000" });
    assert.equal(res.status, 401);
  });
});
