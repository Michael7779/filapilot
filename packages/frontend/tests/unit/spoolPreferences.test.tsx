import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { useSpoolPreferences } from "../../src/hooks/useSpoolPreferences.js";

const CACHE_KEY = "filapilot.spoolPreferences";

function fakeBrowser(options: { narrow: boolean; stored?: Record<string, unknown> }): void {
  const storage = new Map<string, string>();
  if (options.stored) {
    storage.set(CACHE_KEY, JSON.stringify(options.stored));
  }
  Reflect.set(globalThis, "window", { matchMedia: () => ({ matches: options.narrow }) });
  Reflect.set(globalThis, "localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  });
}

function Probe(): React.JSX.Element {
  const { view, pageSize } = useSpoolPreferences();
  return <span>{`${view}|${pageSize}`}</span>;
}

// "<span>view|pageSize</span>" -> "view|pageSize"
const render = (): string => renderToStaticMarkup(<Probe />).slice("<span>".length, -"</span>".length);

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("useSpoolPreferences - Ansicht pro Geraet", () => {
  it("startet ohne Merker auf einem schmalen Bildschirm in Kompakt, auf einem breiten in Standard", () => {
    fakeBrowser({ narrow: true });
    assert.equal(render().split("|")[0], "compact");
    fakeBrowser({ narrow: false });
    assert.equal(render().split("|")[0], "standard");
  });

  it("nimmt den Browser-Merker (iPhone und Desktop sind getrennt) und die Seitengroesse aus dem Merker, solange das Konto keine hat", () => {
    fakeBrowser({ narrow: false, stored: { spoolView: "swatch", spoolPageSize: 48 } });
    assert.equal(render(), "swatch|48");
  });

  it("liest und schreibt den Konto-Wert spoolView nicht mehr", () => {
    // Liest eine feste Projektdatei (relative URL, kein User-Input) - die Regel fuer Nicht-Literale ist hier unkritisch.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const source = readFileSync(new URL("../../src/hooks/useSpoolPreferences.ts", import.meta.url), "utf8");
    assert.ok(!source.includes("user?.spoolView"));
    assert.ok(!source.includes("save({ spoolView"));
  });
});
