/* eslint-disable sonarjs/no-clear-text-protocols -- Testwerte: Es wird gerade geprueft, dass http-Adressen (Heimnetz) und ftp-Adressen richtig behandelt werden; es gibt keine echte Verbindung. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSecureCookie } from "../../src/lib/sessionCookie.js";

describe("Sitzungs-Cookie: secure-Flag", () => {
  it("ist gesetzt, wenn die App ueber eine https-Adresse betrieben wird", () => {
    assert.equal(isSecureCookie("https://filapilot.example.synology.me", false), true);
    assert.equal(isSecureCookie("https://filapilot.example.synology.me:9443", false), true);
  });

  it("ist gesetzt, wenn der Request nachweislich ueber HTTPS kam", () => {
    assert.equal(isSecureCookie("http://192.168.1.50:8090", true), true);
  });

  it("fehlt bei reinem http im Heimnetz, damit der Browser das Cookie ueberhaupt speichert", () => {
    assert.equal(isSecureCookie("http://192.168.1.50:8090", false), false);
    assert.equal(isSecureCookie("http://localhost:5173", false), false);
  });
});
