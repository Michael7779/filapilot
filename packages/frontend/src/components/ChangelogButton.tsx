import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChangelogModal } from "./ChangelogModal.js";

const SEEN_KEY = "fp_changelog_seen";

function readSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function rememberSeenVersion(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Speicher blockiert (z.B. privates Fenster): dann blinkt es beim naechsten Laden eben wieder.
  }
}

// "i"-Knopf in der Kopfzeile. Blinkt rot, solange die neueste Version im Aenderungsverlauf noch nicht angesehen wurde.
export function ChangelogButton(): React.JSX.Element {
  const { t } = useTranslation();
  const latestVersion = __CHANGELOG__[0]?.version ?? null;
  const [open, setOpen] = useState(false);
  const [seenVersion, setSeenVersion] = useState<string | null>(readSeenVersion);
  const hasNews = latestVersion !== null && seenVersion !== latestVersion;

  useEffect(() => {
    if (open && latestVersion) {
      rememberSeenVersion(latestVersion);
      setSeenVersion(latestVersion);
    }
  }, [open, latestVersion]);

  if (latestVersion === null) {
    return <></>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
