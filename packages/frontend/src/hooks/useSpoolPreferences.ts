import { useState } from "react";
import { DEFAULT_SPOOL_PAGE_SIZE, spoolPageSizeSchema, spoolViewSchema, type SpoolView } from "@filapilot/shared";

const CACHE_KEY = "filapilot.spoolPreferences";

interface Cached {
  spoolView?: SpoolView;
  spoolPageSize?: number;
}

function readCache(): Cached {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
    const object: Record<string, unknown> = typeof raw === "object" && raw !== null ? Object.fromEntries(Object.entries(raw)) : {};
    const view = spoolViewSchema.safeParse(object.spoolView);
    const size = spoolPageSizeSchema.safeParse(object.spoolPageSize);
    return { ...(view.success && { spoolView: view.data }), ...(size.success && { spoolPageSize: size.data }) };
  } catch {
    return {};
  }
}

function writeCache(value: Cached): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Speicher nicht verfuegbar (z.B. privates Fenster): die Auswahl gilt trotzdem bis zum Neuladen
  }
}

function defaultView(): SpoolView {
  return window.matchMedia("(max-width: 639px)").matches ? "compact" : "standard";
}

// Ansicht und Seitengroesse der Spulenliste: nur pro Browser/Geraet gemerkt (iPhone und Desktop duerfen unterschiedlich
// sein), nicht im Konto. Ohne Merker startet ein schmaler Bildschirm in "Kompakt", ein breiter in "Standard"; die
// Seitengroesse beginnt mit dem Standardwert. Die alten Konto-Werte (spoolView/spoolPageSize) werden nicht mehr gelesen
// oder geschrieben.
export function useSpoolPreferences(): {
  view: SpoolView;
  pageSize: number;
  setView: (view: SpoolView) => void;
  setPageSize: (size: number) => void;
} {
  const [view, setViewState] = useState<SpoolView>(() => readCache().spoolView ?? defaultView());
  const [pageSize, setPageSizeState] = useState<number>(() => readCache().spoolPageSize ?? DEFAULT_SPOOL_PAGE_SIZE);

  return {
    view,
    pageSize,
    setView: (next) => {
      setViewState(next);
      writeCache({ ...readCache(), spoolView: next });
    },
    setPageSize: (next) => {
      setPageSizeState(next);
      writeCache({ ...readCache(), spoolPageSize: next });
    }
  };
}
