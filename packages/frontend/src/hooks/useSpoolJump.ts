import { useCallback, useEffect, useRef, useState } from "react";
import type { SpoolWithRelations } from "@filapilot/shared";
import type { SpoolFocus } from "../components/SpoolViews.js";

interface UseSpoolJumpOptions {
  visibleSpools: readonly SpoolWithRelations[];
  pageSize: number;
  setPage: (page: number) => void;
  // Blendet ein Filter die Ziel-Spule aus, wird er zurueckgesetzt, damit der Sprung sie findet.
  resetFilter: () => void;
  // Die Liste, in der die Spule seitenweise steht (z.B. nur die Spulen ihres Tabs); ohne Angabe gilt visibleSpools.
  listFor?: (spool: SpoolWithRelations) => readonly SpoolWithRelations[];
  // Wird aufgerufen, sobald die Ziel-Spule gefunden ist (z.B. um auf ihren Tab zu wechseln).
  onLocate?: (spool: SpoolWithRelations) => void;
}

// "Springe zu dieser Spule": schaltet auf die Seite, auf der die Spule in der aktuellen Sortierung steht (pageSize 0 = alle
// auf einer Seite). Das Scrollen und Hervorheben uebernimmt die Listenansicht (useSpoolFocus).
export function useSpoolJump({ visibleSpools, pageSize, setPage, resetFilter, listFor, onLocate }: UseSpoolJumpOptions): { focus: SpoolFocus | null; jumpTo: (spoolId: string) => void } {
  const [focus, setFocus] = useState<SpoolFocus | null>(null);
  const nonce = useRef(0);
  const handled = useRef<SpoolFocus | null>(null);

  const jumpTo = useCallback((spoolId: string): void => {
    nonce.current += 1;
    setFocus({ spoolId, nonce: nonce.current });
  }, []);

  useEffect(() => {
    if (!focus || handled.current === focus) {
      return;
    }
    const target = visibleSpools.find((spool) => spool.id === focus.spoolId);
    if (!target) {
      resetFilter();
      return;
    }
    handled.current = focus;
    onLocate?.(target);
    if (pageSize > 0) {
      const index = (listFor ? listFor(target) : visibleSpools).findIndex((spool) => spool.id === focus.spoolId);
      setPage(Math.floor(index / pageSize) + 1);
    }
  }, [focus, visibleSpools, pageSize, setPage, resetFilter, listFor, onLocate]);

  return { focus, jumpTo };
}
