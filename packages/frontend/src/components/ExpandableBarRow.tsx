import { useId } from "react";
import { useTranslation } from "react-i18next";

interface ExpandableBarRowProps {
  label: string;
  spoolCount: number;
  valueText: string;
  // Balkenlaenge 0..1 im Verhaeltnis zur groessten Zeile.
  ratio: number;
  expanded: boolean;
  onToggle: () => void;
  // Inhalt des aufgeklappten Bereichs (Liste der Spulen).
  children: React.ReactNode;
}

// Eine Zeile mit Namen, Spulenzahl, Wert und Balken; ein Klick klappt darunter die einzelnen Spulen auf und wieder zu.
export function ExpandableBarRow({
  label,
  spoolCount,
  valueText,
  ratio,
  expanded,
  onToggle,
  children
}: ExpandableBarRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left hover:bg-[var(--color-bg)]"
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            <svg
              viewBox="0 0 20 20"
              className={`h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M7.5 4.5a1 1 0 0 1 1.4-.1l5 4.5a1 1 0 0 1 0 1.5l-5 4.5a1 1 0 1 1-1.3-1.5L11.8 10 7.6 6.1a1 1 0 0 1-.1-1.6Z" />
            </svg>
            <span className="truncate">{label}</span>
            <span className="shrink-0 font-normal text-[var(--color-text-muted)]">{t("common.spoolCount", { count: spoolCount })}</span>
          </span>
          <span className="shrink-0 text-[var(--color-text-muted)]">{valueText}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
          <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, backgroundColor: "var(--accent)" }} />
        </div>
      </button>
      {expanded && (
        <ul id={panelId} className="m-0 mb-1 mt-1.5 list-none pl-5">
          {children}
        </ul>
      )}
    </div>
  );
}
