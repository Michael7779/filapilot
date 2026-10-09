import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { InstalledAppTopStrip } from "../../src/components/InstalledAppTopStrip.js";
import { isInstalledWebApp } from "../../src/lib/installedApp.js";

// Minimales window: navigator (optional mit iOS-Eigenschaft "standalone") und matchMedia.
function fakeWindow(options: { standalone?: boolean; displayModeStandalone?: boolean; withMatchMedia?: boolean } = {}) {
  const navigator = options.standalone === undefined ? {} : { standalone: options.standalone };
  const matchMedia = (query: string) => ({ matches: query === "(display-mode: standalone)" && options.displayModeStandalone === true });
  return { navigator, ...(options.withMatchMedia === false ? {} : { matchMedia }) } as unknown as Window;
}

function installWindow(win: Window | undefined): void {
  Reflect.set(globalThis, "window", win);
}

afterEach(() => installWindow(undefined));

describe("isInstalledWebApp", () => {
  it("erkennt den normalen Browser-Tab (kein standalone) als nicht installiert", () => {
    assert.equal(isInstalledWebApp(fakeWindow()), false);
    assert.equal(isInstalledWebApp(fakeWindow({ standalone: false })), false);
    assert.equal(isInstalledWebApp(undefined), false);
  });

  it("erkennt iOS (navigator.standalone) und display-mode: standalone als installiert", () => {
    assert.equal(isInstalledWebApp(fakeWindow({ standalone: true })), true);
    assert.equal(isInstalledWebApp(fakeWindow({ displayModeStandalone: true })), true);
    assert.equal(isInstalledWebApp(fakeWindow({ standalone: false, displayModeStandalone: true })), true);
  });

  it("kommt ohne matchMedia zurecht", () => {
    assert.equal(isInstalledWebApp(fakeWindow({ withMatchMedia: false })), false);
    assert.equal(isInstalledWebApp(fakeWindow({ withMatchMedia: false, standalone: true })), true);
  });
});

describe("InstalledAppTopStrip", () => {
  it("rendert im normalen Browser-Tab nichts", () => {
    installWindow(fakeWindow());
    assert.equal(renderToStaticMarkup(<InstalledAppTopStrip />), "");
  });

  it("rendert im installierten Modus (iOS standalone und display-mode)", () => {
    installWindow(fakeWindow({ standalone: true }));
    assert.notEqual(renderToStaticMarkup(<InstalledAppTopStrip />), "");
    installWindow(fakeWindow({ displayModeStandalone: true }));
    assert.notEqual(renderToStaticMarkup(<InstalledAppTopStrip />), "");
  });

  it("ist fuer Screenreader versteckt, enthaelt keinen Text und faengt keine Tipps ab", () => {
    installWindow(fakeWindow({ standalone: true }));
    const markup = renderToStaticMarkup(<InstalledAppTopStrip />);
    assert.match(markup, /^<div [^>]*><\/div>$/);
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, /pointer-events-none/);
  });

  it("ist 11 px hoch, oben am Rand fixiert und wird nicht gezeichnet (Seitenfarbe + background-clip:text, transparente Schrift)", () => {
    installWindow(fakeWindow({ standalone: true }));
    const markup = renderToStaticMarkup(<InstalledAppTopStrip />);
    for (const cssClass of ["fixed", "inset-x-0", "top-0", "h-[11px]", "z-[100]", "bg-[var(--color-bg)]", "bg-clip-text", "text-transparent"]) {
      assert.ok(markup.split(/[ "]/).includes(cssClass), cssClass);
    }
  });
});

// Liest zwei feste Projektdateien (relative URL, kein User-Input) - deshalb ist die Regel fuer Nicht-Literale hier unkritisch.
function readSource(relativePath: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("Seitenfarbe und Einbau", () => {
  it("nutzt dieselbe Farbvariable wie der Seitenhintergrund (FilaPilot hat nur ein helles Farbschema)", () => {
    const css = readSource("../../src/index.css");
    assert.match(css, /body\s*\{[^}]*background-color:\s*var\(--color-bg\)/);
    assert.doesNotMatch(css, /prefers-color-scheme/, "Gibt es ein dunkles Farbschema, muss die Streifenfarbe mit umschalten (--color-bg tut das automatisch, wenn es dort neu definiert wird).");
  });

  it("sitzt einmal im Wurzel-Layout (App), ausserhalb der Seiten - auch Login und Einrichtung haben ihn", () => {
    const app = readSource("../../src/App.tsx");
    assert.equal(app.match(/<InstalledAppTopStrip \/>/g)?.length, 1);
    assert.ok(app.indexOf("<InstalledAppTopStrip />") < app.indexOf("<Routes>", app.indexOf("export default function App")));
  });
});
