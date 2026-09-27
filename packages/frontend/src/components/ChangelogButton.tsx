import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChangelogModal } from "./ChangelogModal.js";
import { apiRequest } from "../lib/api.js";
import { useAuthStore } from "../stores/useAuthStore.js";

// "i"-Knopf in der Kopfzeile. Blinkt rot, solange die neueste Version im Aenderungsverlauf noch nicht angesehen
// wurde. Gemerkt wird das im Konto (nicht mehr im Browser) - so blinkt es nicht bei jedem neuen Geraet erneut.
export function ChangelogButton(): React.JSX.Element {
  const { t } = useTranslation();
  const latestVersion = __CHANGELOG__[0]?.version ?? null;
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [open, setOpen] = useState(false);
  const hasNews = latestVersion !== null && user?.lastSeenChangelogVersion !== latestVersion;

  function handleOpen(): void {
    setOpen(true);
    if (!latestVersion || !user || user.lastSeenChangelogVersion === latestVersion) {
      return;
    }
    setUser({ ...user, lastSeenChangelogVersion: latestVersion });
    apiRequest("/users/me/preferences", {
      method: "PATCH",
      body: JSON.stringify({ lastSeenChangelogVersion: latestVersion })
    }).catch(() => {
      // Speichern im Konto fehlgeschlagen: fuer diese Sitzung gilt es trotzdem als gesehen.
    });
  }

  if (latestVersion === null) {
    return <></>;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={hasNews ? t("changelog.openNew") : t("changelog.open")}
        title={hasNews ? t("changelog.openNew") : t("changelog.open")}
        className={`flex h-8 w-8 items-center justify-center rounded-full border ${
          hasNews
            ? "animate-blink-red border-[var(--color-danger)] text-[var(--color-danger)]"
            : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v6" />
          <path d="M12 7.5h.01" />
        </svg>
      </button>
      {open && <ChangelogModal entries={__CHANGELOG__} onClose={() => setOpen(false)} />}
    </>
  );
}
