import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SizzleRefreshStatus } from "@filapilot/shared";
import { SLOW_AFTER_SECONDS, deriveRefreshStage, progressPercent, stepIndex } from "../../src/lib/sizzleRefresh.js";

function status(state: SizzleRefreshStatus["state"]): SizzleRefreshStatus {
  return { state, phase: state === "running" ? "fetch" : null, startedAt: null, finishedAt: null, total: null, message: null };
}
const base = { elapsedSeconds: 0, cancelledLocally: false, connectionLost: false, doneVisible: false };

describe("deriveRefreshStage", () => {
  it("ohne Stand ist es ruhig (idle)", () => {
    assert.equal(deriveRefreshStage({ ...base, status: null }), "idle");
    assert.equal(deriveRefreshStage({ ...base, status: status("idle") }), "idle");
  });

  it("zeigt 'running' und kippt nach der Schwelle auf 'slow'", () => {
    assert.equal(deriveRefreshStage({ ...base, status: status("running"), elapsedSeconds: SLOW_AFTER_SECONDS - 1 }), "running");
    assert.equal(deriveRefreshStage({ ...base, status: status("running"), elapsedSeconds: SLOW_AFTER_SECONDS }), "slow");
  });

  it("eine unterbrochene Verbindung zum Server zaehlt sofort als 'slow'", () => {
    assert.equal(deriveRefreshStage({ ...base, status: status("running"), elapsedSeconds: 1, connectionLost: true }), "slow");
  });

  it("ein Abbruch durch den Benutzer gilt sofort, auch wenn der Server noch 'running' meldet", () => {
    assert.equal(deriveRefreshStage({ ...base, status: status("running"), cancelledLocally: true }), "cancelled");
  });

  it("'done' ist nur kurz sichtbar, danach wieder ruhig", () => {
    assert.equal(deriveRefreshStage({ ...base, status: status("done"), doneVisible: true }), "done");
    assert.equal(deriveRefreshStage({ ...base, status: status("done"), doneVisible: false }), "idle");
  });

  it("uebernimmt 'cancelled' und 'error' vom Server", () => {
    assert.equal(deriveRefreshStage({ ...base, status: status("cancelled") }), "cancelled");
    assert.equal(deriveRefreshStage({ ...base, status: status("error") }), "error");
  });
});

describe("stepIndex / progressPercent", () => {
  it("ordnet die Schritte zu", () => {
    assert.equal(stepIndex("fetch"), 0);
    assert.equal(stepIndex("parse"), 1);
    assert.equal(stepIndex("save"), 2);
    assert.equal(stepIndex(null), 0);
  });

  it("der Balken waechst mit den Schritten und ist bei 'done' voll", () => {
    assert.ok(progressPercent("running", "fetch") < progressPercent("running", "parse"));
    assert.ok(progressPercent("running", "parse") < progressPercent("running", "save"));
    assert.ok(progressPercent("running", "save") < 100);
    assert.equal(progressPercent("done", null), 100);
  });

  it("nach Abbruch oder Fehler bleibt der Balken beim zuletzt erreichten Schritt", () => {
    assert.equal(progressPercent("cancelled", "fetch"), progressPercent("running", "fetch"));
    assert.equal(progressPercent("error", "parse"), progressPercent("running", "parse"));
  });

  it("ruhig = leer", () => {
    assert.equal(progressPercent("idle", null), 0);
  });
});
