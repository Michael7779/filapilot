import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SPOOL_PAGE_SIZE } from "@filapilot/shared";
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

describe("useSpoolPreferences - Ansicht und Seitengroesse pro Geraet", () => {
  it("startet ohne Merker auf einem schmalen Bildschirm in Kompakt, auf einem breiten in Standard", () => {
    fakeBrowser({ narrow: true });
    assert.equal(render().split("|")[0], "compact");
    fakeBrowser({ narrow: false });
    assert.equal(render().split("|")[0], "standard");
  });

  it("nimmt Ansicht und Seitengroesse aus dem Browser-Merker (iPhone und Desktop sind getrennt)", () => {
    fakeBrowser({ narrow: false, stored: { spoolView: "swatch", spoolPageSize: 48 } });
    assert.equal(render(), "swatch|48");
  });

  it("beginnt ohne Merker mit der Standard-Seitengroesse", () => {
    fakeBrowser({ narrow: false });
    assert.equal(render().split("|")[1], String(DEFAULT_SPOOL_PAGE_SIZE));
  });

  it("verwirft ungueltige Merker-Werte", () => {
    fakeBrowser({ narrow: false, stored: { spoolView: "kaputt", spoolPageSize: 7 } });
    assert.equal(render(), `standard|${DEFAULT_SPOOL_PAGE_SIZE}`);
  });

  it("liest und schreibt keine Konto-Werte mehr (kein Aufruf der Einstellungs-Route)", () => {
    // Liest eine feste Projektdatei (relative URL, kein User-Input) - die Regel fuer Nicht-Literale ist hier unkritisch.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const source = readFileSync(new URL("../../src/hooks/useSpoolPreferences.ts", import.meta.url), "utf8");
    assert.ok(!source.includes("users/me/preferences"));
    assert.ok(!source.includes("useAuthStore"));
  });
});
