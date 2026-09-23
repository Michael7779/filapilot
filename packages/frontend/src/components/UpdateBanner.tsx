import { useTranslation } from "react-i18next";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const FALLBACK_RELOAD_DELAY_MS = 1500;

// Zuverlaessiger als auf das Workbox-Ereignis zu warten (das nach Strg+F5 nicht ausgeloest wird,
// weil die Seite dann ohne aktiven Service Worker geladen wurde): alle Registrierungen und
// Caches verwerfen und frisch vom Server laden - der neue Service Worker registriert sich danach neu.
async function hardRefresh(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  window.location.reload();
}

export function UpdateBanner(): React.JSX.Element | null {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) {
        return;
      }
      const check = (): void => {
        registration.update().catch(() => {
          // Offline oder Server kurz nicht erreichbar - naechster Versuch folgt automatisch.
        });
      };
      setInterval(check, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          check();
        }
      });
    }
  });

  function handleUpdate(): void {
    updateServiceWorker(true).catch(() => {
      // Der Rueckfall unten greift auch dann.
    });
    window.setTimeout(() => {
      hardRefresh().catch(() => window.location.reload());
    }, FALLBACK_RELOAD_DELAY_MS);
  }

  if (!needRefresh) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 text-sm"
    >
      <span>{t("update.available")}</span>
      <button
        type="button"
        onClick={handleUpdate}
        className="self-end rounded-lg px-4 py-1.5 text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--accent)" }}
      >
        {t("update.refresh")}
      </button>
    </div>
  );
}
