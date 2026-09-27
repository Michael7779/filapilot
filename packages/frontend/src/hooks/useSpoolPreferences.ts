import { useCallback } from "react";
import {
  DEFAULT_SPOOL_PAGE_SIZE,
  spoolPageSizeSchema,
  spoolViewSchema,
  type SpoolView,
  type UpdateOwnPreferencesInput,
  type UserPublic
} from "@filapilot/shared";
import { apiRequest } from "../lib/api.js";
import { useAuthStore } from "../stores/useAuthStore.js";

const CACHE_KEY = "filapilot.spoolPreferences";

interface Cached {
  spoolView?: SpoolView;
  spoolPageSize?: number;
}

// Zuletzt benutzte Werte im Browser, damit die Seite sofort in der richtigen Ansicht startet (das Konto ist massgeblich).
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
    // Speicher nicht verfuegbar (z.B. privates Fenster): das Konto merkt es trotzdem
  }
}

function defaultView(): SpoolView {
  return window.matchMedia("(max-width: 639px)").matches ? "compact" : "standard";
}

// Ansicht und Seitengroesse der Spulenliste: aus dem Konto (sonst Browser-Merker, sonst Standard); Aenderungen werden im Konto gespeichert.
export function useSpoolPreferences(): {
  view: SpoolView;
  pageSize: number;
  setView: (view: SpoolView) => void;
  setPageSize: (size: number) => void;
} {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const cache = readCache();
  const view = user?.spoolView ?? cache.spoolView ?? defaultView();
  const pageSize = user?.spoolPageSize ?? cache.spoolPageSize ?? DEFAULT_SPOOL_PAGE_SIZE;

  const save = useCallback(
    (patch: UpdateOwnPreferencesInput) => {
      const current = useAuthStore.getState().user;
      if (current) {
        // sofort anzeigen, dann im Konto speichern
        setUser({
          ...current,
          ...(patch.spoolView !== undefined && { spoolView: patch.spoolView }),
          ...(patch.spoolPageSize !== undefined && { spoolPageSize: patch.spoolPageSize })
        });
      }
      writeCache({
        ...readCache(),
        ...(patch.spoolView && { spoolView: patch.spoolView }),
        ...(typeof patch.spoolPageSize === "number" && { spoolPageSize: patch.spoolPageSize })
      });
      apiRequest<UserPublic>("/users/me/preferences", { method: "PATCH", body: JSON.stringify(patch) })
        .then((updated) => setUser(updated))
        .catch(() => {
          // Speichern im Konto fehlgeschlagen: die Auswahl gilt trotzdem in diesem Browser
        });
    },
    [setUser]
  );

  return {
    view,
    pageSize,
    setView: (next) => save({ spoolView: next }),
    setPageSize: (next) => save({ spoolPageSize: next })
  };
}
