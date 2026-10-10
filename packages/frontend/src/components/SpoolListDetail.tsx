import { useTranslation } from "react-i18next";
import { effectiveLastModifiedAt, estimateRemainingLengthM, type CustomFieldDefinition, type Material, type SpoolSortColumn, type SpoolWithRelations } from "@filapilot/shared";

interface SpoolListDetailProps {
  spool: SpoolWithRelations;
  material: Material | undefined;
  customFieldDefinitions: readonly CustomFieldDefinition[];
  // Die Ueberschriften der aufgeklappten Angaben sortieren die Liste (wie frueher die Spaltenkoepfe).
  renderLabel: (column: SpoolSortColumn, label: string) => React.JSX.Element;
}

// "60 °C" bei nur einem Wert, sonst "60–80 °C" als Bereich (Material.bedTempMaxC).
function bedTempCell(bedTempC: number | null, bedTempMaxC: number | null): string {
  if (bedTempC === null) {
    return "–";
  }
  return bedTempMaxC !== null ? `${bedTempC}–${bedTempMaxC} °C` : `${bedTempC} °C`;
}

// Lieferform nur bei ungeoeffneten Spulen: "Nachfüllung" bzw. "Filament mit Spule", sonst "–".
function packagingLabel(spool: SpoolWithRelations, t: (key: string) => string): string {
  if (spool.openedAt) {
    return "–";
  }
  return t(spool.isRefill ? "spools.packaging.refill" : "spools.packaging.withSpool");
}

// Die Angaben einer Spule, die in der Zeile selbst keinen Platz haben (Aufklapp-Bereich der Listenansicht).
export function SpoolListDetail({ spool, material, customFieldDefinitions, renderLabel }: SpoolListDetailProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const date = (value: Date | string | null): string => (value ? new Date(value).toLocaleDateString(i18n.language) : "–");
  const dateTime = (value: Date | string): string => new Date(value).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  const length = estimateRemainingLengthM(spool.remainingWeightG, material?.densityGCm3 ?? null, material?.filamentDiameterMm);
  const price = spool.purchasePriceCents === null ? "–" : (spool.purchasePriceCents / 100).toLocaleString(i18n.language, { style: "currency", currency: "EUR" });
  const customFields = customFieldDefinitions
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

  const fields: { column: SpoolSortColumn; label: string; value: string }[] = [
    { column: "nozzle", label: t("spools.list.nozzle"), value: material ? `${material.printTempMinC}–${material.printTempMaxC} °C` : "–" },
    { column: "bed", label: t("spools.list.bed"), value: material ? bedTempCell(material.bedTempC, material.bedTempMaxC) : "–" },
    { column: "length", label: t("spools.list.length"), value: length === null ? "–" : `${t("spools.list.approx")} ${Math.round(length).toLocaleString(i18n.language)} m` },
    { column: "price", label: t("spools.filter.price"), value: price },
    { column: "purchasedAt", label: t("spools.list.purchasedAt"), value: date(spool.purchasedAt) },
    { column: "addedAt", label: t("spools.list.addedAt"), value: dateTime(spool.createdAt) },
    { column: "lastModifiedAt", label: t("spools.list.lastModifiedAt"), value: dateTime(effectiveLastModifiedAt(spool)) },
    { column: "packaging", label: t("spools.packaging.listLabel"), value: packagingLabel(spool, t) }
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
      {fields.map((field) => (
        <div key={field.column}>
          <dt className="text-xs text-[var(--color-text-muted)]">{renderLabel(field.column, field.label)}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
      <div className="col-span-2 sm:col-span-3 lg:col-span-4">
        <dt className="text-xs text-[var(--color-text-muted)]">{renderLabel("note", t("spools.note"))}</dt>
        <dd className="whitespace-pre-wrap">{spool.note ?? "–"}</dd>
      </div>
      {customFields && (
        <div className="col-span-2 sm:col-span-3 lg:col-span-4">
          <dt className="text-xs text-[var(--color-text-muted)]">{t("spools.customFields")}</dt>
          <dd>{customFields}</dd>
        </div>
      )}
    </dl>
  );
}
