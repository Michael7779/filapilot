import { describe, it } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import request from "supertest";
import { createApp } from "../../src/app.js";

// CVE-2026-111497 (Brotli-Decoder): Der Body-Parser (express.json, global vor allen Routen, auch ohne Login)
// darf "br" nie dekodieren. Die Anfrage scheitert, bevor ein Handler oder die Datenbank beteiligt ist -
// deshalb braucht dieser Test weder Nutzer noch Daten. Der Server antwortet mit einem Clientfehler (400),
// nicht mit einem Serverfehler (500), und schreibt dafuer keinen Fehler ins Log.
describe("Request-Kodierung - Negativ-Tests", () => {
  const app = createApp();
  const json = Buffer.from("{}");

  function postLogin(contentEncoding: string, body: Buffer) {
    return request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", contentEncoding)
      // superagent wuerde einen Buffer bei application/json sonst selbst als JSON verpacken
      .serialize((data: Buffer) => data)
      .send(body);
  }

  function assertEncodingRejected(res: request.Response): void {
    assert.equal(res.status, 400);
    assert.equal(res.body.data, null);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
    assert.match(res.body.error.message, /Kodierung/);
    assert.doesNotMatch(JSON.stringify(res.body), /stack|brotli|at /i);
  }

  it("lehnt ein gueltiges Brotli-Body ohne Login mit 400 ab", async () => {
    assertEncodingRejected(await postLogin("br", zlib.brotliCompressSync(json)));
  });

  it("lehnt kaputte Brotli-Bytes mit 400 ab", async () => {
    assertEncodingRejected(await postLogin("br", Buffer.from([0xff, 0x00, 0x13, 0x37])));
  });

  it("lehnt die Schreibweise 'BR' mit 400 ab", async () => {
    assertEncodingRejected(await postLogin("BR", zlib.brotliCompressSync(json)));
  });

  it("lehnt gestapelte Kodierungen ('br, gzip') mit 400 ab", async () => {
    assertEncodingRejected(await postLogin("br, gzip", zlib.gzipSync(json)));
  });

  it("lehnt eine unbekannte Kodierung mit 400 ab", async () => {
    assertEncodingRejected(await postLogin("zstd", json));
  });

  it("lehnt einen nicht unterstuetzten Zeichensatz mit 400 ab", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json; charset=iso-8859-1")
      .send(json);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
    assert.match(res.body.error.message, /Zeichensatz/);
  });

  it("nimmt gzip weiterhin an (Kontrolle: der Body wird dekodiert und erst danach validiert)", async () => {
    const res = await postLogin("gzip", zlib.gzipSync(json));
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
    assert.doesNotMatch(res.body.error.message, /Kodierung|Zeichensatz/);
  });
});
