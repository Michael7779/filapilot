import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { registerSW } from "virtual:pwa-register";
import { getSocket } from "../lib/socket.js";
import { attachReloadOnControllerChange, scheduleForcedReloadFallback } from "../lib/pwaUpdateReload.js";
import { useAuthStore } from "../stores/useAuthStore.js";

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const FORCED_RELOAD_AFTER_MS = 5000;

// Fragt aktiv nach einer neuen sw.js, sobald einer der Ausloeser eintritt, und liefert die Funktion, die alles wieder abmeldet.
// Ein einfaches F5 prueft laut Service-Worker-Spezifikation NICHT auf eine neue sw.js (der Browser tut das von sich aus nur
// 1x pro 24 h) - deshalb: sofort bei der Registrierung, bei Rueckkehr in den Vordergrund, nach einer Socket.IO-Wiederverbindung
// (ein Deploy startet den Server neu, die Clients verbinden sich danach neu) und alle 15 Minuten als Auffangnetz.
function startUpdateChecks(registration: ServiceWorkerRegistration): () => void {
  const check = (): void => {
    registration.update().catch(() => {
      // Offline oder Server kurz nicht erreichbar - der naechste Ausloeser fragt erneut nach.
    });
  };
  check();

  const handleVisible = (): void => {
    if (document.visibilityState === "visible") {
      check();
    }
  };
  document.addEventListener("visibilitychange", handleVisible);

  // Socket.IO erst anfassen, wenn jemand angemeldet ist: auf Login-/Einrichtungsseiten gaebe es nur einen unnoetigen,
  // serverseitig abgelehnten Verbindungsversuch. Der Anmeldestatus steht beim Registrieren meist noch aus ("loading"),
  // deshalb haengt der Listener sich per Store-Abo an, sobald er feststeht.
  let detachSocket: (() => void) | undefined;
  const attachSocket = (): void => {
    if (detachSocket || useAuthStore.getState().status !== "authenticated") {
      return;
    }
    const socket = getSocket();
    socket.on("connect", check);
    detachSocket = () => socket.off("connect", check);
  };
  attachSocket();
  const unsubscribeAuth = useAuthStore.subscribe(attachSocket);

  const intervalId = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  return () => {
    clearInterval(intervalId);
    document.removeEventListener("visibilitychange", handleVisible);
    unsubscribeAuth();
    detachSocket?.();
  };
}

// Hinweis "Neue Version bereit" fuer ALLE Nutzer (blaue Leiste oben, auch auf Login-/Einrichtungsseiten, siehe App.tsx).
// Gleiches Verhalten wie im Schwesterprojekt AutoLogbuch, dort ueber mehrere Nutzer-Meldungen gehaertet:
// - Bewusst KEIN automatischer Reload: der wuerde offene Formulare ungefragt verwerfen, der Nutzer entscheidet per Button.
// - "immediate: true": ohne wartet die Registrierung auf das "load"-Ereignis, das beim Mounten dieser Komponente laengst
//   vorbei ist - es wuerde dann nie ein Service Worker registriert.
export function UpdateBanner(): React.JSX.Element | null {
  const { t } = useTranslation();
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const updateSW = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const cancelFallback = useRef<(() => void) | null>(null);

  useEffect(() => {
    let stopChecks: (() => void) | undefined;
    updateSW.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedsRefresh(true);
      },
      onRegistered(registration) {
        if (registration) {
          stopChecks = startUpdateChecks(registration);
        }
      },
      onRegisterError(error: unknown) {
        // Eine fehlgeschlagene Registrierung ist kein Absturzgrund - nur Offline-Faehigkeit und Update-Erkennung fehlen dann.
        console.error("Service-Worker-Registrierung fehlgeschlagen", error);
      }
    });
    return () => stopChecks?.();
  }, []);

  // Solange ein Update bereitsteht, laedt jeder "controllerchange" neu; das stoppt zugleich den Sicherheits-Timer.
  useEffect(() => {
    if (!needsRefresh) {
      return undefined;
    }
    return attachReloadOnControllerChange(() => {
      cancelFallback.current?.();
      cancelFallback.current = null;
    });
  }, [needsRefresh]);

  if (!needsRefresh) {
    return null;
  }

  // Klick: sauberer Weg (SKIP_WAITING -> controllerchange -> Reload) PLUS ein bedingungsloser Sicherheits-Timer, falls der
  // Browser (Proxy, mehrere Tabs, Safari) nicht reagiert - der Button darf sich nie "tot" anfuehlen.
  function handleUpdateClick(): void {
    cancelFallback.current?.();
    cancelFallback.current = scheduleForcedReloadFallback(FORCED_RELOAD_AFTER_MS);
    updateSW.current?.(true).catch(() => {
      // Der Sicherheits-Timer oben greift auch dann.
    });
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm text-blue-900 shadow-sm"
    >
      <span>{t("update.available")}</span>
      <button
        type="button"
        title={t("update.refresh")}
        onClick={handleUpdateClick}
        className="shrink-0 rounded-lg px-3 py-1 text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--accent)" }}
      >
        {t("update.refresh")}
      </button>
    </div>
  );
}
