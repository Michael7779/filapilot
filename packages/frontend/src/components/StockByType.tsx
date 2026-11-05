import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { LOW_STOCK_THRESHOLD_RATIO, remainingPercent } from "@filapilot/shared";
import type { SpoolWithRelations } from "@filapilot/shared";
import { groupStockByType } from "../lib/stockByType.js";
import type { StockGroup } from "../lib/stockByType.js";
import { ColorDot } from "./SpoolViews.js";

// Fuellstand-Balken in der Farbe des Filaments (zweifarbig als Verlauf); der Rand haelt helle Farben (Weiss) sichtbar.
function ColorFillBar({ spool }: { spool: SpoolWithRelations }): React.JSX.Element {
  const percent = Math.min(100, Math.max(0, Math.round(remainingPercent(spool))));
  const first = spool.colorHex ?? "#cccccc";
  const background = spool.colorHex2 ? `linear-gradient(90deg, ${first} 50%, ${spool.colorHex2} 50%)` : first;
  return (
    <div
      className="h-2.5 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={spool.colorName}
    >
      <div className="h-full rounded-full" style={{ width: `${percent}%`, background }} />
    </div>
  );
}

function StockSpoolRow({ spool }: { spool: SpoolWithRelations }): React.JSX.Element {
  const percent = Math.round(remainingPercent(spool));
  const low = spool.remainingWeightG > 0 && spool.remainingWeightG / spool.initialWeightG <= LOW_STOCK_THRESHOLD_RATIO;
  return (
    <li className="flex items-center gap-2.5 border-t border-[var(--color-border)] py-2 first:border-t-0">
      <ColorDot hex={spool.colorHex} hex2={spool.colorHex2} size="h-3.5 w-3.5" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{spool.colorName}</div>
        <div className="truncate text-[11.5px] text-[var(--color-text-secondary)]">
          {spool.manufacturerName} · {spool.materialName}
        </div>
      </div>
      <div className="w-16 shrink-0 sm:w-32">
        <ColorFillBar spool={spool} />
      </div>
      <div
        className={`w-24 shrink-0 text-right text-xs font-medium ${low ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}`}
      >
        {spool.remainingWeightG} g · {percent} %
      </div>
    </li>
  );
}

interface StockRowProps {
  group: StockGroup;
  maxG: number;
  expanded: boolean;
  onToggle: () => void;
}

function StockRow({ group, maxG, expanded, onToggle }: StockRowProps): React.JSX.Element {
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
          <span className="flex items-center gap-1.5 font-medium">
            <svg
              viewBox="0 0 20 20"
              className={`h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M7.5 4.5a1 1 0 0 1 1.4-.1l5 4.5a1 1 0 0 1 0 1.5l-5 4.5a1 1 0 1 1-1.3-1.5L11.8 10 7.6 6.1a1 1 0 0 1-.1-1.6Z" />
            </svg>
            {group.type}
            <span className="font-normal text-[var(--color-text-muted)]">
              {t("dashboard.stockSpoolCount", { count: group.spools.length })}
            </span>
          </span>
          <span className="text-[var(--color-text-muted)]">{(group.totalG / 1000).toFixed(2)} kg</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
          <div
            className="h-full rounded-full"
            style={{ width: `${(group.totalG / maxG) * 100}%`, backgroundColor: "var(--accent)" }}
          />
        </div>
      </button>
      {expanded && (
        <ul id={panelId} className="m-0 mb-1 mt-1.5 list-none pl-5">
          {group.spools.map((spool) => (
            <StockSpoolRow key={spool.id} spool={spool} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Restbestand je Material-Typ (nicht Verbrauch - das zeigt schon die Statistik-Seite): "was habe ich noch da".
// Ein Klick auf ein Material klappt darunter die einzelnen Spulen mit Farbe auf; ein zweiter Klick klappt zu.
export function StockByType({ spools }: { spools: readonly SpoolWithRelations[] }): React.JSX.Element {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const groups = groupStockByType(spools);
  const maxG = Math.max(1, ...groups.map((group) => group.totalG));

  function toggle(type: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(type)) {
        next.add(type);
      }
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("dashboard.stockByType")}</h3>
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("dashboard.noStock")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <StockRow
              key={group.type}
              group={group}
              maxG={maxG}
              expanded={expanded.has(group.type)}
              onToggle={() => toggle(group.type)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
