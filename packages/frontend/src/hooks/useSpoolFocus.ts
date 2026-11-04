import { useEffect, useRef, useState } from "react";
import type { SpoolFocus } from "../components/SpoolViews.js";

const FLASH_MS = 2000;

export const spoolRowDomId = (spoolId: string): string => `spool-row-${spoolId}`;

// Springt die Spulen-Seite auf eine Spule (z.B. per Klick unter "Weitere Spulen"), scrollt diese Ansicht die Zeile in die
// Mitte und liefert ihre ID kurz zurueck, damit sie hervorgehoben werden kann. Jeder Sprung wird nur einmal ausgefuehrt,
// auch wenn die Liste danach neu geladen wird; eine Ansicht ohne diese Spule tut nichts.
export function useSpoolFocus(focus: SpoolFocus | null | undefined, spoolIds: readonly string[]): string | null {
  const [flashId, setFlashId] = useState<string | null>(null);
  const handled = useRef<SpoolFocus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!focus || handled.current === focus || !spoolIds.includes(focus.spoolId)) {
      return;
    }
    const row = document.getElementById(spoolRowDomId(focus.spoolId));
    if (!row) {
      return;
    }
    handled.current = focus;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    setFlashId(focus.spoolId);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlashId(null), FLASH_MS);
  }, [focus, spoolIds]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return flashId;
}
