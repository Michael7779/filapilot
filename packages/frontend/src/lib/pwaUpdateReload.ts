// Reload-Logik des Update-Hinweises als eigene, reine Datei (statt inline in UpdateBanner.tsx): UpdateBanner.tsx importiert
// "virtual:pwa-register", ein von Vite zur Buildzeit erzeugtes virtuelles Modul, das unter node:test nicht aufloesbar ist.
// Hier liegt deshalb alles, was sich ohne dieses Modul testen laesst; die Umgebung (Service-Worker-Container, Reload) ist
// austauschbar. Siehe auch AutoLogbuch (Schwesterprojekt), aus dem diese Logik samt Befunden stammt.

export interface ReloadEnvironment {
  serviceWorker: Pick<ServiceWorkerContainer, "addEventListener" | "removeEventListener"> | undefined;
  reload: () => void;
}

function browserEnvironment(): ReloadEnvironment {
  return {
    serviceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
    reload: () => window.location.reload()
  };
}

// Laedt die Seite bei JEDEM "controllerchange" neu, solange der Aufrufer die Funktion nicht wieder abmeldet (der Hinweis ist
// nur sichtbar, solange ein Update bereitsteht). Bewusst bedingungslos und unabhaengig vom "isUpdate"-Flag aus
// workbox-window: das wird bei der Registrierung EINMALIG eingefroren, und war der Controller zu diesem Zeitpunkt "null"
// (in Safari z.B. durch ITP nach einigen Tagen), blieb der Klick auf "Aktualisieren" sonst ganz ohne Wirkung. "onControllerChange"
// laeuft VOR dem Reload und stoppt dort den Sicherheits-Timer. Ohne Service-Worker-Unterstuetzung passiert nichts.
export function attachReloadOnControllerChange(
  onControllerChange?: () => void,
  environment: ReloadEnvironment = browserEnvironment()
): (() => void) | undefined {
  const { serviceWorker, reload } = environment;
  if (!serviceWorker) {
    return undefined;
  }
  const handleControllerChange = (): void => {
    onControllerChange?.();
    reload();
  };
  serviceWorker.addEventListener("controllerchange", handleControllerChange);
  return () => serviceWorker.removeEventListener("controllerchange", handleControllerChange);
}

// Sicherheits-Timer: reagiert der Browser nach einem Klick nicht innerhalb von "timeoutMs" mit einem echten "controllerchange"
// (Reverse-Proxy-Caching, mehrere offene Tabs, browserspezifische Aussetzer), erzwingt der Button selbst den Reload, damit er
// sich nie "tot" anfuehlt. Der Rueckgabewert stoppt den Timer wieder, sobald der saubere Weg doch rechtzeitig greift (ein
// zweiter Reload waere harmlos, aber unsauber).
export function scheduleForcedReloadFallback(timeoutMs: number, reload: () => void = browserEnvironment().reload): () => void {
  const timer = setTimeout(reload, timeoutMs);
  return () => clearTimeout(timer);
}
