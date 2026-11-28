import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { BambuCloudError, describeHitFields, httpBambuCloudClient } from "../../src/services/bambuCloudClient.js";
import { toAppError } from "../../src/services/bambuImportService.js";

interface FakeReply {
  status?: number;
  body?: string;
  type?: string;
}

function fakeFetch(replies: FakeReply[]): string[] {
  const urls: string[] = [];
  mock.method(globalThis, "fetch", (url: string) => {
    urls.push(String(url));
    const reply = replies.shift() ?? { status: 200, body: "{}" };
    return Promise.resolve(
      new Response(reply.body ?? "", { status: reply.status ?? 200, headers: { "content-type": reply.type ?? "application/json" } })
    );
  });
  return urls;
}

async function failure(action: () => Promise<unknown>): Promise<BambuCloudError> {
  try {
    await action();
  } catch (err) {
    assert.ok(err instanceof BambuCloudError);
    return err;
  }
  throw new Error("Es wurde kein Fehler geworfen");
}

describe("Bambu-Cloud-Client (mit gefaelschten Antworten der Cloud)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("Code anfordern gilt bei HTTP 200 als Erfolg - auch mit leerer oder nicht lesbarer Antwort (echter Fall: Code kam an, Import meldete Fehler)", async () => {
    for (const body of ["", "ok", "{}", '{"code":0}']) {
      fakeFetch([{ status: 200, body }]);
      await httpBambuCloudClient.sendCode("global", "konto@example.test");
      mock.restoreAll();
    }
  });

  it("Code anfordern schlaegt bei HTTP-Fehlern fehl und nennt Schritt, Status und Feldnamen - nie Inhalte", async () => {
    fakeFetch([{ status: 400, body: '{"message":"GEHEIM-NACHRICHT","code":1}' }]);
    const err = await failure(() => httpBambuCloudClient.sendCode("global", "konto@example.test"));
    assert.equal(err.kind, "invalid_response");
    assert.deepEqual(err.detail, { step: "E-Mail-Code senden", status: 400, keys: ["message", "code"] });
    const message = toAppError(err).message;
    assert.match(message, /Schritt: E-Mail-Code senden, HTTP 400/);
    assert.ok(!message.includes("GEHEIM-NACHRICHT"));
  });

  it("Anmeldung erkennt Token, E-Mail-Code, Authenticator und falsche Zugangsdaten", async () => {
    fakeFetch([{ body: '{"accessToken":"tok"}' }]);
    assert.deepEqual(await httpBambuCloudClient.login("global", "a@b.de", "pw"), { kind: "ok", token: "tok" });
    fakeFetch([{ body: '{"success":false,"loginType":"verifyCode"}' }]);
    assert.deepEqual(await httpBambuCloudClient.login("global", "a@b.de", "pw"), { kind: "code_required" });
    fakeFetch([{ body: '{"loginType":"tfa","tfaKey":"x"}' }]);
    assert.deepEqual(await httpBambuCloudClient.login("global", "a@b.de", "pw"), { kind: "tfa_required" });
    fakeFetch([{ status: 400, body: '{"code":1,"error":"falsch"}' }]);
    const wrong = await failure(() => httpBambuCloudClient.login("global", "a@b.de", "pw"));
    assert.equal(wrong.kind, "credentials");
  });

  it("liest die Nutzer-ID (uid) aus den Einstellungen des Kontos - Zahl oder Text, sonst Fehler ohne Inhalte", async () => {
    const urls = fakeFetch([{ body: '{"uid":4711}' }, { body: '{"uid":"9001"}' }, { body: '{"nickname":"GEHEIM"}' }]);
    assert.equal(await httpBambuCloudClient.getUserId("global", "tok"), "4711");
    assert.equal(await httpBambuCloudClient.getUserId("china", "tok"), "9001");
    assert.equal(urls[0], "https://api.bambulab.com/v1/design-user-service/my/preference");
    assert.equal(urls[1], "https://api.bambulab.cn/v1/design-user-service/my/preference");
    const err = await failure(() => httpBambuCloudClient.getUserId("global", "tok"));
    assert.equal(err.kind, "invalid_response");
    assert.deepEqual(err.detail, { step: "Nutzer-ID", status: 200, keys: ["nickname"] });
  });

  it("meldet bei abgelehntem Token (401) beim Lesen der Nutzer-ID 'unauthorized'", async () => {
    fakeFetch([{ status: 401, body: "{}" }]);
    assert.equal((await failure(() => httpBambuCloudClient.getUserId("global", "tok"))).kind, "unauthorized");
  });

  it("liest die letzten Druckauftraege - feste Adresse, hoechstens wenige, bei Fehlern ohne Inhalte", async () => {
    const urls = fakeFetch([{ body: '{"total":1,"hits":[{"weight":5}]}' }, { body: '{"message":"GEHEIM"}' }]);
    assert.deepEqual(await httpBambuCloudClient.listTasks("global", "tok"), [{ weight: 5 }]);
    assert.equal(urls[0], "https://api.bambulab.com/v1/user-service/my/tasks?limit=20");
    const err = await failure(() => httpBambuCloudClient.listTasks("global", "tok"));
    assert.deepEqual(err.detail, { step: "Druckhistorie", status: 200, keys: ["message"] });
  });

  it("beschreibt die Felder der Spulenliste nur mit Namen - und welche Notiz-artigen Felder Text enthalten, nie die Inhalte", () => {
    const described = describeHitFields([
      { id: "1", color: "FF0000", note: "", memoText: "GEHEIM-NOTIZ" },
      { id: "2", note: null, "GEHEIM schluessel mit leerzeichen": 1 },
      "kein objekt"
    ]);
    assert.deepEqual(described, { fields: ["color", "id", "memoText", "note"], noteLikeWithText: ["memoText"] });
    assert.ok(!JSON.stringify(described).includes("GEHEIM"));
  });

  it("nutzt je Region die feste Adresse", async () => {
    const urls = fakeFetch([{ body: '{"accessToken":"t"}' }, { body: '{"accessToken":"t"}' }]);
    await httpBambuCloudClient.login("global", "a@b.de", "pw");
    await httpBambuCloudClient.login("china", "a@b.de", "pw");
    assert.deepEqual(urls, [
      "https://api.bambulab.com/v1/user-service/user/login",
      "https://api.bambulab.cn/v1/user-service/user/login"
    ]);
  });

  it("erkennt den Bot-Schutz (HTML-Seite oder 403) und Netzwerkfehler", async () => {
    fakeFetch([{ status: 200, body: "<html>Just a moment...</html>", type: "text/html" }]);
    assert.equal((await failure(() => httpBambuCloudClient.login("global", "a@b.de", "pw"))).kind, "blocked");
    fakeFetch([{ status: 403, body: "{}" }]);
    assert.equal((await failure(() => httpBambuCloudClient.login("global", "a@b.de", "pw"))).kind, "blocked");
    mock.method(globalThis, "fetch", () => Promise.reject(new TypeError("fetch failed")));
    assert.equal((await failure(() => httpBambuCloudClient.login("global", "a@b.de", "pw"))).kind, "network");
  });

  it("liest die Spulenliste seitenweise, meldet abgelaufene Zugaenge und unerwartete Antworten", async () => {
    const page = (from: number, count: number) => JSON.stringify({ total: 150, hits: Array.from({ length: count }, (_, i) => ({ id: from + i })) });
    const urls = fakeFetch([{ body: page(0, 100) }, { body: page(100, 50) }]);
    const all = await httpBambuCloudClient.listFilaments("global", "tok");
    assert.equal(all.length, 150);
    assert.match(urls[1] ?? "", /offset=100/);

    fakeFetch([{ status: 401, body: "{}" }]);
    assert.equal((await failure(() => httpBambuCloudClient.listFilaments("global", "tok"))).kind, "unauthorized");
    fakeFetch([{ body: '{"unerwartet":true}' }]);
    const odd = await failure(() => httpBambuCloudClient.listFilaments("global", "tok"));
    assert.equal(odd.kind, "invalid_response");
    assert.deepEqual(odd.detail?.keys, ["unerwartet"]);
  });
});
