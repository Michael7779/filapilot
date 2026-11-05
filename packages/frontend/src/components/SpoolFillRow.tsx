import { LOW_STOCK_THRESHOLD_RATIO, remainingPercent } from "@filapilot/shared";
import type { SpoolWithRelations } from "@filapilot/shared";
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

interface SpoolFillRowProps {
  spool: SpoolWithRelations;
  // Zusatzzeile unter dem Fuellstand (z.B. "320 g verbraucht"); Archiviert-Marke direkt am Farbnamen.
  detail?: string | undefined;
  archivedLabel?: string | undefined;
}

// Eine Spule in der aufgeklappten Liste: Farbpunkt, Farbname, Hersteller + Material, Farbbalken, Gramm und Prozent.
export function SpoolFillRow({ spool, detail, archivedLabel }: SpoolFillRowProps): React.JSX.Element {
  const percent = Math.round(remainingPercent(spool));
  const low = spool.remainingWeightG > 0 && spool.remainingWeightG / spool.initialWeightG <= LOW_STOCK_THRESHOLD_RATIO;
  return (
    <li className="flex items-center gap-2.5 border-t border-[var(--color-border)] py-2 first:border-t-0">
      <ColorDot hex={spool.colorHex} hex2={spool.colorHex2} size="h-3.5 w-3.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{spool.colorName}</span>
          {archivedLabel && (
            <span className="shrink-0 rounded-full bg-[var(--color-bg)] px-1.5 text-[10.5px] text-[var(--color-text-secondary)]">
              {archivedLabel}
            </span>
          )}
        </div>
        <div className="truncate text-[11.5px] text-[var(--color-text-secondary)]">
          {spool.manufacturerName} · {spool.materialName}
        </div>
      </div>
      <div className="w-16 shrink-0 sm:w-32">
        <ColorFillBar spool={spool} />
      </div>
      <div className="w-24 shrink-0 text-right">
        <div
          className={`text-xs font-medium ${low ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}`}
        >
          {spool.remainingWeightG} g · {percent} %
        </div>
        {detail && <div className="text-[11px] text-[var(--color-text-secondary)]">{detail}</div>}
      </div>
    </li>
  );
}
