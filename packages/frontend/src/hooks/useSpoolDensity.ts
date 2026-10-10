import { useCallback, useState } from "react";

export type SpoolDensity = "normal" | "compact";

const STORAGE_KEY = "filapilot.spoolListDensity";

function read(): SpoolDensity {
  try {
    return localStorage.getItem(STORAGE_KEY) === "compact" ? "compact" : "normal";
  } catch {
    return "normal";
  }
}

// Zeilendichte der Listenansicht: bewusst nur pro Browser gemerkt (eine Anzeigesache je Geraet, kein Konto-Wert).
export function useSpoolDensity(): { density: SpoolDensity; setDensity: (density: SpoolDensity) => void } {
  const [density, setDensityState] = useState<SpoolDensity>(read);

  const setDensity = useCallback((next: SpoolDensity) => {
    setDensityState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Speicher nicht verfuegbar (z.B. privates Fenster): gilt trotzdem bis zum Neuladen
    }
  }, []);

  return { density, setDensity };
}
