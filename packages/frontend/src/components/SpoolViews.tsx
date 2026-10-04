import { useTranslation } from "react-i18next";
import {
  LOW_STOCK_THRESHOLD_RATIO,
  remainingPercent,
  type CustomFieldDefinition,
  type Material,
  type SpoolColumnSort,
  type SpoolSortColumn,
  type SpoolWithRelations
} from "@filapilot/shared";
import { SpoolActions, type SpoolHandlers } from "./SpoolActions.js";
import { formatBedTemp } from "../lib/formatTemps.js";

export interface SpoolViewProps extends SpoolHandlers {
  spools: readonly SpoolWithRelations[];
  materials: readonly Material[];
  isAll: boolean;
  // Nur von ListView genutzt (Spalte "Zusatzfelder"); die anderen Ansichten reichen es ungenutzt durch.
  customFieldDefinitions: readonly CustomFieldDefinition[];
  // Nur von ListView genutzt (klickbare Spaltenueberschriften); die Sortierung selbst macht die Spulen-Seite.
  columnSort?: SpoolColumnSort | null;
  onColumnSort?: (column: SpoolSortColumn) => void;
}

function isLow(spool: SpoolWithRelations): boolean {
  return spool.remainingWeightG / spool.initialWeightG <= LOW_STOCK_THRESHOLD_RATIO;
}

// Zweifarbig (colorHex2 gesetzt): zwei Haelften statt einer Flaeche.
export function ColorDot({ hex, hex2 = null, size = "h-5 w-5" }: { hex: string | null; hex2?: string | null; size?: string }): React.JSX.Element {
  const background = hex2 ? `linear-gradient(90deg, ${hex ?? "#cccccc"} 50%, ${hex2} 50%)` : (hex ?? "#cccccc");
  return <div className={`${size} shrink-0 rounded-full border border-[var(--color-border)]`} style={{ background }} aria-hidden="true" />;
}

export function WeightBar({ spool }: { spool: SpoolWithRelations }): React.JSX.Element {
  const percent = Math.round(remainingPercent(spool));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
      <div
        className="h-full rounded-full"
        style={{ width: `${percent}%`, backgroundColor: spool.remainingWeightG > 0 && isLow(spool) ? "var(--color-danger)" : "var(--accent)" }}
      />
    </div>
  );
}

function StatusBadge({ spool }: { spool: SpoolWithRelations }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (spool.archivedAt) {
    return (
      <span className="shrink-0 rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
        {spool.archiveReason === "CLOUD_REMOVED" ? t("spools.archivedCloud") : t("spools.archived")}
      </span>
    );
  }
  if (isLow(spool)) {
    return (
      <span className="shrink-0 rounded-full bg-[var(--color-danger)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-danger)]">
        {t("spools.lowStock")}
      </span>
    );
  }
  if (!spool.openedAt) {
    return (
      <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
        {t("spools.unopened")}
      </span>
    );
  }
  return null;
}

// Standard: wie bisher - Foto, alle Kerndaten und sichtbare Aktionen.
export function StandardView({ spools, materials, isAll, ...handlers }: SpoolViewProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {spools.map((spool) => {
        const temps = materials.find((material) => material.id === spool.materialId);
        const bedTemp = temps ? formatBedTemp(temps.bedTempC, temps.bedTempMaxC, t) : null;
        const percent = Math.round(remainingPercent(spool));
        return (
          <div key={spool.id} className={`rounded-xl border border-[var(--color-border)] bg-white p-4 ${spool.archivedAt ? "opacity-70" : ""}`}>
            {spool.photoUrl && (
              <img src={spool.photoUrl} alt="" loading="lazy" className="mb-3 h-32 w-full rounded-lg border border-[var(--color-border)] object-cover" />
            )}
            <div className="mb-2 flex items-center gap-2">
              <ColorDot hex={spool.colorHex} hex2={spool.colorHex2} />
              <div className="text-sm font-semibold">
                {spool.materialName} {spool.colorName}
              </div>
              <span className="ml-auto flex items-center gap-1">
                <StatusBadge spool={spool} />
                <SpoolActions spool={spool} {...handlers} />
              </span>
            </div>
            <div className="mb-2 text-xs text-[var(--color-text-muted)]">
              {isAll && spool.inventoryName ? `${spool.inventoryName} · ` : ""}
              {spool.manufacturerName}
              {spool.location ? ` · ${spool.location}` : ""}
            </div>
            {temps && (
              <div className="mb-2 text-xs text-[var(--color-text-muted)]">
                {t("spools.tempHint", { min: temps.printTempMinC, max: temps.printTempMaxC })}
                {bedTemp && ` · ${bedTemp}`}
              </div>
            )}
            <div className="mb-1">
              <WeightBar spool={spool} />
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              {spool.remainingWeightG} g / {spool.initialWeightG} g ({percent} %)
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Kompakt: kleine Kacheln, Aktionen im Menue.
export function CompactView({ spools, isAll, ...handlers }: SpoolViewProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {spools.map((spool) => (
        <div key={spool.id} className={`rounded-xl border border-[var(--color-border)] bg-white p-3 ${spool.archivedAt ? "opacity-70" : ""}`}>
          <div className="mb-1 flex items-center gap-2">
            <ColorDot hex={spool.colorHex} hex2={spool.colorHex2} size="h-3.5 w-3.5" />
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">{spool.colorName}</div>
            <SpoolActions spool={spool} {...handlers} />
          </div>
          <div className="mb-2 truncate text-xs text-[var(--color-text-muted)]" title={`${spool.manufacturerName} ${spool.materialName}`}>
            {isAll && spool.inventoryName ? `${spool.inventoryName} · ` : ""}
            {spool.manufacturerName} {spool.materialName}
          </div>
          <WeightBar spool={spool} />
          <div className="mt-1 flex items-center justify-between gap-1 text-xs text-[var(--color-text-secondary)]">
            <span>
              {spool.remainingWeightG} g ({Math.round(remainingPercent(spool))} %)
            </span>
            <StatusBadge spool={spool} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Farbkacheln: grosse Farbflaeche, wenig Text.
export function SwatchView({ spools, ...handlers }: SpoolViewProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {spools.map((spool) => (
        <div key={spool.id} className={`overflow-hidden rounded-xl border border-[var(--color-border)] bg-white ${spool.archivedAt ? "opacity-70" : ""}`}>
          <div className="relative h-20 border-b border-[var(--color-border)]" style={{ background: spool.colorHex2 ? `linear-gradient(90deg, ${spool.colorHex ?? "#cccccc"} 50%, ${spool.colorHex2} 50%)` : (spool.colorHex ?? "#cccccc") }}>
            <div className="absolute right-1 top-1 rounded-md bg-white/85">
              <SpoolActions spool={spool} {...handlers} />
            </div>
          </div>
          <div className="p-2.5">
            <div className="truncate text-sm font-semibold">{spool.colorName}</div>
            <div className="truncate text-xs text-[var(--color-text-muted)]">{spool.materialName}</div>
            <div className="mt-1 flex items-center justify-between gap-1 text-xs text-[var(--color-text-secondary)]">
              <span>
                {spool.remainingWeightG} g ({Math.round(remainingPercent(spool))} %)
              </span>
              <StatusBadge spool={spool} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
