import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attachReloadOnControllerChange, scheduleForcedReloadFallback, type ReloadEnvironment } from "../../src/lib/pwaUpdateReload.js";

type Listener = () => void;

function fakeEnvironment(): { environment: ReloadEnvironment; reloads: number; fire: () => void; listeners: () => number; order: string[] } {
  const listeners = new Set<Listener>();
  const state = { reloads: 0, order: [] as string[] };
  const environment: ReloadEnvironment = {
    serviceWorker: {
      addEventListener: (type: string, listener: unknown) => {
        assert.equal(type, "controllerchange");
        listeners.add(listener as Listener);
      },
      removeEventListener: (_type: string, listener: unknown) => {
        listeners.delete(listener as Listener);
      }
    },
    reload: () => {
      state.reloads += 1;
      state.order.push("reload");
    }
  };
  return {
    environment,
    get reloads() {
      return state.reloads;
    },
    order: state.order,
    fire: () => [...listeners].forEach((listener) => listener()),
    listeners: () => listeners.size
  };
}

describe("attachReloadOnControllerChange", () => {
  it("laedt bei controllerchange neu, auch bei jedem weiteren", () => {
    const fake = fakeEnvironment();
    attachReloadOnControllerChange(undefined, fake.environment);
    assert.equal(fake.reloads, 0);
    fake.fire();
    assert.equal(fake.reloads, 1);
    fake.fire();
    assert.equal(fake.reloads, 2);
  });

  it("ruft den Haken VOR dem Reload auf", () => {
    const fake = fakeEnvironment();
    attachReloadOnControllerChange(() => fake.order.push("haken"), fake.environment);
    fake.fire();
    assert.deepEqual(fake.order, ["haken", "reload"]);
  });

  it("tut ohne Service-Worker-Unterstuetzung nichts und liefert keine Abmelde-Funktion", () => {
    let reloads = 0;
    const detach = attachReloadOnControllerChange(undefined, { serviceWorker: undefined, reload: () => (reloads += 1) });
    assert.equal(detach, undefined);
    assert.equal(reloads, 0);
  });

  it("meldet den Listener mit der Abmelde-Funktion wieder ab (kein Reload mehr)", () => {
    const fake = fakeEnvironment();
    const detach = attachReloadOnControllerChange(undefined, fake.environment);
    assert.equal(fake.listeners(), 1);
    detach?.();
    assert.equal(fake.listeners(), 0);
    fake.fire();
    assert.equal(fake.reloads, 0);
  });
});

describe("scheduleForcedReloadFallback", () => {
  it("erzwingt den Reload nach Ablauf der Zeit, vorher nicht", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let reloads = 0;
    scheduleForcedReloadFallback(5000, () => (reloads += 1));
    t.mock.timers.tick(4999);
    assert.equal(reloads, 0);
    t.mock.timers.tick(1);
    assert.equal(reloads, 1);
  });

  it("laesst sich stoppen, dann gibt es keinen Reload", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let reloads = 0;
    const cancel = scheduleForcedReloadFallback(5000, () => (reloads += 1));
    t.mock.timers.tick(3000);
    cancel();
    t.mock.timers.tick(10000);
    assert.equal(reloads, 0);
  });
});
