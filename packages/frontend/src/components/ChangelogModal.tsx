import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ChangelogEntry } from "@filapilot/shared";

interface ChangelogModalProps {
  entries: readonly ChangelogEntry[];
  onClose: () => void;
}

export function ChangelogModal({ entries, onClose }: ChangelogModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("changelog.title")}
        className="flex max-h-[85dvh] w-full max-w-[520px] flex-col rounded-xl border border-[var(--color-border)] bg-white"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-bold">{t("changelog.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-[var(--color-text-muted)]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto px-6 pb-6">
          {entries.map((entry) => (
            <section key={entry.version}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                  {t("changelog.version", { version: entry.version })}
                </h3>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {new Date(`${entry.date}T12:00:00`).toLocaleDateString(i18n.language)}
                </span>
              </div>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--color-text-secondary)]">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
