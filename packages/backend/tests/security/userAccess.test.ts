import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/prisma.js";
import { createLoggedInUser, resetInventoryData, type TestUser } from "../helpers/fixtures.js";

describe("Freigaben und Super-Admin - Negativ-Tests", () => {
  const app = createApp();
  let superAdmin: TestUser;
  let secondSuper: TestUser;
  let admin: TestUser;
  let normal: TestUser;
  let noFilament: TestUser;
  let sizzleOnly: TestUser;
  let superNoFlags: TestUser;

  before(async () => {
    await resetInventoryData();
    superAdmin = await createLoggedInUser(app, "accsuper", "ADMIN", { isSuperAdmin: true });
    secondSuper = await createLoggedInUser(app, "accsuper2", "ADMIN", { isSuperAdmin: true });
    admin = await createLoggedInUser(app, "accadmin", "ADMIN");
    normal = await createLoggedInUser(app, "accnormal");
    noFilament = await createLoggedInUser(app, "accnofil", "USER", { canUseFilament: false });
    sizzleOnly = await createLoggedInUser(app, "accsizzle", "USER", { canUseFilament: false, canUseSizzle: true });
    superNoFlags = await createLoggedInUser(app, "accsuperflags", "ADMIN", { isSuperAdmin: true, canUseFilament: false, canUseSizzle: false });
  });

  after(async () => {
    await resetInventoryData();
    await prisma.$disconnect();
  });

  const call = (method: "get" | "post" | "patch" | "delete", url: string, user: TestUser | null, body: object = {}) => {
    const req = request(app)[method](url);
    return (user ? req.set("Cookie", user.cookie) : req).send(body);
  };
  const FILAMENT_URLS = ["/api/materials", "/api/manufacturers", "/api/inventories", "/api/wishlist", "/api/printers", "/api/custom-field-definitions"];
  const SIZZLE_URLS = ["/api/sizzle/wishes", "/api/sizzle/products"];

  describe("Zugriff auf die Bereiche (Z1, Z6)", () => {
    it("anonym: 401 in beiden Bereichen", async () => {
      for (const url of [...FILAMENT_URLS, ...SIZZLE_URLS]) {
        assert.equal((await call("get", url, null)).status, 401, url);
      }
    });

    it("neue Konten haben die Filamentverwaltung, aber nicht die Sizzle-Wunschliste", async () => {
      const filament = await call("get", "/api/materials", normal);
      assert.equal(filament.status, 200);
      for (const url of SIZZLE_URLS) {
        assert.equal((await call("get", url, normal)).status, 403, url);
      }
    });

    it("ohne Filament-Freigabe: 403 auf allen Filament-Routen, eigenes Konto bleibt erreichbar", async () => {
      for (const url of FILAMENT_URLS) {
        assert.equal((await call("get", url, noFilament)).status, 403, url);
      }
      assert.equal((await call("get", "/api/users/me", noFilament)).status, 200);
    });

    it("ohne Filament-Freigabe sind auch schreibende Filament-Routen gesperrt", async () => {
      assert.equal((await call("post", "/api/wishlist", noFilament, { title: "Test" })).status, 403);
      assert.equal((await call("post", "/api/manufacturers", noFilament, { name: "X" })).status, 403);
    });

    it("mit Sizzle-Freigabe: Sizzle ja, Filament weiterhin nein", async () => {
      assert.equal((await call("get", "/api/sizzle/wishes", sizzleOnly)).status, 200);
      assert.equal((await call("get", "/api/materials", sizzleOnly)).status, 403);
    });

    it("ein Admin ohne Freigabe sieht die Filamentverwaltung nicht, die Einstellungen aber schon", async () => {
      const blockedAdmin = await createLoggedInUser(app, "accblockedadmin", "ADMIN", { canUseFilament: false });
      assert.equal((await call("get", "/api/materials", blockedAdmin)).status, 403);
      assert.equal((await call("get", "/api/sizzle/wishes", blockedAdmin)).status, 403);
      assert.equal((await call("get", "/api/settings", blockedAdmin)).status, 200);
      assert.equal((await call("get", "/api/users", blockedAdmin)).status, 200);
    });

    it("ein Super-Admin hat immer beides, auch mit abgeschalteten Freigaben", async () => {
      assert.equal((await call("get", "/api/materials", superNoFlags)).status, 200);
      assert.equal((await call("get", "/api/sizzle/wishes", superNoFlags)).status, 200);
    });

    it("/api/users/me liefert Super-Admin-Status und Freigaben", async () => {
      const me = await call("get", "/api/users/me", sizzleOnly);
      assert.equal(me.body.data.isSuperAdmin, false);
      assert.equal(me.body.data.canUseFilament, false);
      assert.equal(me.body.data.canUseSizzle, true);
    });
  });

  describe("Wer Freigaben setzen darf (Z2)", () => {
    it("ein normaler Nutzer kann keine Benutzer verwalten (403)", async () => {
      assert.equal((await call("patch", `/api/users/${normal.id}`, normal, { canUseSizzle: true })).status, 403);
    });

    it("ein Admin ohne Super-Admin darf keine Freigaben setzen - auch nicht fuer sich selbst (403)", async () => {
      assert.equal((await call("patch", `/api/users/${normal.id}`, admin, { canUseSizzle: true })).status, 403);
      assert.equal((await call("patch", `/api/users/${admin.id}`, admin, { isSuperAdmin: true })).status, 403);
      assert.equal((await call("patch", `/api/users/${admin.id}`, admin, { canUseFilament: true })).status, 403);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
      assert.equal(after.isSuperAdmin, false);
      assert.equal((await call("get", "/api/sizzle/wishes", normal)).status, 403);
    });

    it("ein Admin ohne Super-Admin darf beim Anlegen keine Freigaben mitgeben (403)", async () => {
      const res = await call("post", "/api/users", admin, { username: "accnew1", email: "accnew1@example.test", role: "USER", canUseSizzle: true });
      assert.equal(res.status, 403);
      assert.equal(await prisma.user.count({ where: { username: "accnew1" } }), 0);
    });

    it("ein Admin ohne Super-Admin darf sonstige Angaben weiterhin aendern", async () => {
      const res = await call("patch", `/api/users/${normal.id}`, admin, { email: "accnormal2@example.test" });
      assert.equal(res.status, 200);
    });

    it("ein Super-Admin gibt die Sizzle-Wunschliste frei und entzieht sie wieder - wirkt sofort", async () => {
      const grant = await call("patch", `/api/users/${normal.id}`, superAdmin, { canUseSizzle: true });
      assert.equal(grant.status, 200);
      assert.equal(grant.body.data.canUseSizzle, true);
      assert.equal((await call("get", "/api/sizzle/wishes", normal)).status, 200);

      const revoke = await call("patch", `/api/users/${normal.id}`, superAdmin, { canUseSizzle: false, canUseFilament: false });
      assert.equal(revoke.status, 200);
      assert.equal((await call("get", "/api/sizzle/wishes", normal)).status, 403);
      assert.equal((await call("get", "/api/materials", normal)).status, 403);

      await call("patch", `/api/users/${normal.id}`, superAdmin, { canUseFilament: true });
    });

    it("ein Super-Admin legt Benutzer mit Freigaben an", async () => {
      const res = await call("post", "/api/users", superAdmin, { username: "accnew2", email: "accnew2@example.test", role: "USER", canUseSizzle: true, canUseFilament: false });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.canUseSizzle, true);
      assert.equal(res.body.data.canUseFilament, false);
      assert.equal(res.body.data.isSuperAdmin, false);
    });

    it("ohne Angabe bekommt ein neues Konto die Filamentverwaltung, aber nicht Sizzle", async () => {
      const res = await call("post", "/api/users", admin, { username: "accnew3", email: "accnew3@example.test", role: "USER" });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.canUseFilament, true);
      assert.equal(res.body.data.canUseSizzle, false);
    });
  });

  describe("Super-Admin-Konten schuetzen (Z3)", () => {
    it("ein Admin ohne Super-Admin darf ein Super-Admin-Konto nicht aendern (403)", async () => {
      assert.equal((await call("patch", `/api/users/${superAdmin.id}`, admin, { email: "x@example.test" })).status, 403);
    });

    it("ein Admin ohne Super-Admin darf ein Super-Admin-Konto nicht loeschen (403)", async () => {
      assert.equal((await call("delete", `/api/users/${secondSuper.id}`, admin)).status, 403);
      assert.equal(await prisma.user.count({ where: { id: secondSuper.id } }), 1);
    });

    it("ein Admin ohne Super-Admin darf das Passwort eines Super-Admins nicht zuruecksetzen (403)", async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: superAdmin.id } });
      assert.equal((await call("post", `/api/users/${superAdmin.id}/reset-password`, admin)).status, 403);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: superAdmin.id } });
      assert.equal(after.passwordHash, before.passwordHash);
      assert.equal((await call("get", "/api/users/me", superAdmin)).status, 200);
    });
  });

  describe("Regeln fuer Super-Admins (Z4, Z5)", () => {
    it("ein Super-Admin muss Admin sein: Rolle USER bzw. isSuperAdmin bei USER -> 400", async () => {
      assert.equal((await call("patch", `/api/users/${secondSuper.id}`, superAdmin, { role: "USER" })).status, 400);
      assert.equal((await call("patch", `/api/users/${normal.id}`, superAdmin, { isSuperAdmin: true })).status, 400);
      assert.equal(
        (await call("post", "/api/users", superAdmin, { username: "accnew4", email: "accnew4@example.test", role: "USER", isSuperAdmin: true })).status,
        400
      );
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: secondSuper.id } });
      assert.equal(stored.role, "ADMIN");
      assert.equal(stored.isSuperAdmin, true);
    });

    it("ein Super-Admin kann einen Admin zum Super-Admin machen", async () => {
      const res = await call("patch", `/api/users/${admin.id}`, superAdmin, { isSuperAdmin: true });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.isSuperAdmin, true);
      await call("patch", `/api/users/${admin.id}`, superAdmin, { isSuperAdmin: false });
    });

    it("der letzte Super-Admin kann sich nicht herabstufen (409), solange er der einzige ist", async () => {
      const lonelyApp = createApp();
      await prisma.user.updateMany({ where: { id: { in: [secondSuper.id, superNoFlags.id] } }, data: { isSuperAdmin: false } });
      const res = await request(lonelyApp).patch(`/api/users/${superAdmin.id}`).set("Cookie", superAdmin.cookie).send({ isSuperAdmin: false });
      assert.equal(res.status, 409);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: superAdmin.id } })).isSuperAdmin, true);
      await prisma.user.updateMany({ where: { id: { in: [secondSuper.id, superNoFlags.id] } }, data: { isSuperAdmin: true } });
    });

    it("der letzte Super-Admin kann nicht geloescht werden (409)", async () => {
      // Der einzige verbleibende Super-Admin versucht, den anderen (und damit sich selbst als letzten) zu entfernen:
      // Zwei Super-Admins duerfen einander loeschen, solange einer bleibt - der zweite Aufruf scheitert dann.
      await prisma.user.updateMany({ where: { id: superNoFlags.id }, data: { isSuperAdmin: false } });
      const removed = await call("delete", `/api/users/${secondSuper.id}`, superAdmin);
      assert.equal(removed.status, 200);
      // Jetzt ist superAdmin der letzte: er kann sich weder herabstufen noch (ohnehin) selbst loeschen.
      assert.equal((await call("patch", `/api/users/${superAdmin.id}`, superAdmin, { isSuperAdmin: false })).status, 409);
      assert.equal((await call("delete", `/api/users/${superAdmin.id}`, superAdmin)).status, 409);
      assert.equal(await prisma.user.count({ where: { isSuperAdmin: true } }), 1);
    });
  });
});
