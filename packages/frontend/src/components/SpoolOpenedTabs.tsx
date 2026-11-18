import { useTranslation } from "react-i18next";

export type SpoolOpenedTab = "started" | "unopened";

// Reihenfolge der Tabs: erst die angefangenen, dann die ungeoeffneten Spulen.
export const OPENED_TABS: readonly SpoolOpenedTab[] = ["started", "unopened"];

interface SpoolOpenedTabsProps {
  active: SpoolOpenedTab;
  counts: Record<SpoolOpenedTab, number>;
  // Kurzer Text rechts neben den Tabs (Anzahl + Gewicht des gewaehlten Tabs).
  summary: string;
  onChange: (tab: SpoolOpenedTab) => void;
}

const tabId = (tab: SpoolOpenedTab): string => `spool-tab-${tab}`;
export const spoolTabPanelId = "spool-tab-panel";

// Tab-Leiste "Angefangene | Ungeoeffnete" ueber der Spulenliste; der gewaehlte Tab bestimmt, welche Tabelle darunter steht.
export function SpoolOpenedTabs({ active, counts, summary, onChange }: SpoolOpenedTabsProps): React.JSX.Element {
  const { t } = useTranslation();

  // Pfeiltasten wechseln zwischen den Tabs (Tastatur-Bedienung wie bei einem Tab-Widget).
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const next = OPENED_TABS[(OPENED_TABS.indexOf(active) + 1) % OPENED_TABS.length] ?? active;
    onChange(next);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 border-b border-[var(--color-border)]">
      <div role="tablist" aria-label={t("spools.groups.label")} className="flex gap-1">
        {OPENED_TABS.map((tab) => {
          const selected = tab === active;
          return (
            <button
              key={tab}
              id={tabId(tab)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={spoolTabPanelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab)}
              onKeyDown={handleKeyDown}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${selected ? "" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}
              style={selected ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}
            >
              {t(`spools.groups.${tab}`)} <span className="font-normal text-[var(--color-text-muted)]">({counts[tab]})</span>
            </button>
          );
        })}
      </div>
      <span className="pb-2 text-xs text-[var(--color-text-muted)]">{summary}</span>
    </div>
  );
}
