import { useTranslation } from "react-i18next";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

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

  if (!needRefresh) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-accent-bg)] px-6 py-3 text-sm"
    >
      <span>{t("update.available")}</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="rounded-lg px-4 py-1.5 text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--accent)" }}
      >
        {t("update.refresh")}
      </button>
    </div>
  );
}
