import { useTranslation } from "react-i18next";
import { estimateRemainingLengthM, type SpoolWithRelations } from "@filapilot/shared";
import { SpoolActions } from "./SpoolActions.js";
import { ColorDot, WeightBar, type SpoolViewProps } from "./SpoolViews.js";

const headClass = "whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]";
const cellClass = "whitespace-nowrap px-3 py-2 align-middle";

// "–" ohne bekannte Dichte des Materials, sonst "≈ 335 m" (Naeherung, siehe estimateRemainingLengthM).
function formatLength(meters: number | null, locale: string, t: (key: string) => string): string {
  if (meters === null) {
    return "–";
  }
  return `${t("spools.list.approx")} ${Math.round(meters).toLocaleString(locale)} m`;
}

// "60 °C" bei nur einem Wert, sonst "60–80 °C" als Bereich (Material.bedTempMaxC).
function bedTempCell(bedTempC: number | null, bedTempMaxC: number | null): string {
  if (bedTempC === null) {
    return "–";
  }
  return bedTempMaxC !== null ? `${bedTempC}–${bedTempMaxC} °C` : `${bedTempC} °C`;
}

function statusKey(spool: SpoolWithRelations): string {
  if (!spool.archivedAt) {
    return "spools.list.active";
  }
  return spool.archiveReason === "CLOUD_REMOVED" ? "spools.archivedCloud" : "spools.archived";
}

// Liste: eine Zeile pro Spule mit ALLEN Angaben (Material, Farbe, Temperaturen, Gewicht, Lagerort, Preis, Datum, Notiz, Zusatzfelder).
export function ListView({ spools, materials, isAll, customFieldDefinitions, ...handlers }: SpoolViewProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const date = (value: Date | string | null): string => (value ? new Date(value).toLocaleDateString(i18n.language) : "–");
  const price = (spool: SpoolWithRelations): string =>
    spool.purchasePriceCents === null ? "–" : (spool.purchasePriceCents / 100).toLocaleString(i18n.language, { style: "currency", currency: "EUR" });
  const customFieldSummary = (spool: SpoolWithRelations): string =>
    customFieldDefinitions
      .filter((definition) => spool.customFields[definition.id] != null && spool.customFields[definition.id] !== "")
      .map((definition) => {
        const value = spool.customFields[definition.id];
        let display = String(value);
        if (definition.kind === "BOOLEAN") {
          display = value ? t("audit.yes") : t("audit.no");
        }
        return `${definition.name}: ${display}`;
      })
      .join(" · ");

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className={headClass}>{t("spools.list.color")}</th>
            <th className={headClass}>{t("spools.manufacturer")}</th>
            <th className={headClass}>{t("spools.material")}</th>
            {isAll && <th className={headClass}>{t("spools.inventory")}</th>}
            <th className={headClass}>{t("spools.list.nozzle")}</th>
            <th className={headClass}>{t("spools.list.bed")}</th>
            <th className={headClass}>{t("spools.list.weight")}</th>
            <th className={headClass}>{t("spools.list.length")}</th>
            <th className={headClass}>{t("spools.filter.location")}</th>
            <th className={headClass}>{t("spools.filter.price")}</th>
            <th className={headClass}>{t("spools.list.purchasedAt")}</th>
            <th className={headClass}>{t("spools.list.addedAt")}</th>
            <th className={headClass}>{t("spools.note")}</th>
            {customFieldDefinitions.length > 0 && <th className={headClass}>{t("spools.customFields")}</th>}
            <th className={headClass}>{t("spools.list.status")}</th>
            <th className={headClass}>
              <span className="sr-only">{t("spools.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {spools.map((spool) => {
            const temps = materials.find((material) => material.id === spool.materialId);
            const percent = Math.round((spool.remainingWeightG / spool.initialWeightG) * 100);
            return (
              <tr key={spool.id} className={`border-b border-[var(--color-border)] last:border-b-0 ${spool.archivedAt ? "opacity-70" : ""}`}>
                <td className={cellClass}>
                  <span className="flex items-center gap-2">
                    <ColorDot hex={spool.colorHex} hex2={spool.colorHex2} size="h-4 w-4" />
                    <span>
                      <span className="font-medium">{spool.colorName}</span>
                      {spool.colorHex && <span className="ml-1 text-xs text-[var(--color-text-muted)]">{spool.colorHex.toUpperCase()}</span>}
                    </span>
                  </span>
                </td>
                <td className={cellClass}>{spool.manufacturerName}</td>
                <td className={cellClass}>{spool.materialName}</td>
                {isAll && <td className={cellClass}>{spool.inventoryName ?? "–"}</td>}
                <td className={cellClass}>{temps ? `${temps.printTempMinC}–${temps.printTempMaxC} °C` : "–"}</td>
                <td className={cellClass}>{temps ? bedTempCell(temps.bedTempC, temps.bedTempMaxC) : "–"}</td>
                <td className={cellClass}>
                  <div className="w-36">
                    <WeightBar spool={spool} />
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {spool.remainingWeightG} g / {spool.initialWeightG} g ({percent} %)
                    </span>
                  </div>
                </td>
                <td className={cellClass}>
                  {formatLength(estimateRemainingLengthM(spool.remainingWeightG, temps?.densityGCm3 ?? null, temps?.filamentDiameterMm), i18n.language, t)}
                </td>
                <td className={cellClass}>{spool.location ?? "–"}</td>
                <td className={cellClass}>{price(spool)}</td>
                <td className={cellClass}>{date(spool.purchasedAt)}</td>
                <td className={cellClass}>{date(spool.createdAt)}</td>
                <td className={`${cellClass} max-w-[160px] truncate`} title={spool.note ?? ""}>
                  {spool.note ?? "–"}
                </td>
                {customFieldDefinitions.length > 0 && (
                  <td className={`${cellClass} max-w-[200px] truncate`} title={customFieldSummary(spool)}>
                    {customFieldSummary(spool) || "–"}
                  </td>
                )}
                <td className={cellClass}>{t(statusKey(spool))}</td>
                <td className={cellClass}>
                  <SpoolActions spool={spool} {...handlers} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
