import { useTranslation } from "react-i18next";
import { effectiveLastModifiedAt, estimateRemainingLengthM, type CustomFieldDefinition, type Material, type SpoolWithRelations } from "@filapilot/shared";

interface SpoolListDetailProps {
  spool: SpoolWithRelations;
  material: Material | undefined;
  customFieldDefinitions: readonly CustomFieldDefinition[];
}

export interface DetailItem {
  key: string;
  label: string;
  value: string;
}

// "60 °C" bei nur einem Wert, sonst "60–80 °C" als Bereich (Material.bedTempMaxC).
function bedTempCell(bedTempC: number | null, bedTempMaxC: number | null): string | null {
  if (bedTempC === null) {
    return null;
  }
  return bedTempMaxC !== null ? `${bedTempC}–${bedTempMaxC} °C` : `${bedTempC} °C`;
}

// Lieferform nur bei ungeoeffneten Spulen: "Nachfüllung" bzw. "Filament mit Spule", sonst nichts.
function packagingLabel(spool: SpoolWithRelations, t: (key: string) => string): string | null {
  if (spool.openedAt) {
    return null;
  }
  return t(spool.isRefill ? "spools.packaging.refill" : "spools.packaging.withSpool");
}

function customFieldItems(spool: SpoolWithRelations, definitions: readonly CustomFieldDefinition[], t: (key: string) => string): DetailItem[] {
  const items: DetailItem[] = [];
  for (const definition of definitions) {
    const value = spool.customFields[definition.id];
    if (value == null || value === "") {
      continue;
    }
    let display = String(value);
    if (definition.kind === "BOOLEAN") {
      display = t(value ? "audit.yes" : "audit.no");
    }
    items.push({ key: `custom-${definition.id}`, label: definition.name, value: display });
  }
  return items;
}

interface DetailFormat {
  t: (key: string) => string;
  language: string;
}

// Die Angaben unter einer Spule in der Listenansicht, in fester Reihenfolge. Angaben ohne Wert (kein Preis, nie gekauft,
// keine Notiz ...) entfallen ganz, damit die Zeile kurz bleibt.
export function buildDetailItems(spool: SpoolWithRelations, material: Material | undefined, customFieldDefinitions: readonly CustomFieldDefinition[], { t, language }: DetailFormat): DetailItem[] {
  const length = estimateRemainingLengthM(spool.remainingWeightG, material?.densityGCm3 ?? null, material?.filamentDiameterMm);
  const date = (value: Date | string): string => new Date(value).toLocaleDateString(language);
  const dateTime = (value: Date | string): string => new Date(value).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" });
  const candidates: { key: string; label: string; value: string | null }[] = [
    { key: "nozzle", label: t("spools.list.nozzle"), value: material ? `${material.printTempMinC}–${material.printTempMaxC} °C` : null },
    { key: "bed", label: t("spools.list.bed"), value: material ? bedTempCell(material.bedTempC, material.bedTempMaxC) : null },
    { key: "length", label: t("spools.list.length"), value: length === null ? null : `${t("spools.list.approx")} ${Math.round(length).toLocaleString(language)} m` },
    {
      key: "price",
      label: t("spools.filter.price"),
      value: spool.purchasePriceCents === null ? null : (spool.purchasePriceCents / 100).toLocaleString(language, { style: "currency", currency: "EUR" })
    },
    { key: "purchasedAt", label: t("spools.list.purchasedAt"), value: spool.purchasedAt ? date(spool.purchasedAt) : null },
    { key: "addedAt", label: t("spools.list.addedAt"), value: dateTime(spool.createdAt) },
    { key: "lastModifiedAt", label: t("spools.list.lastModifiedAt"), value: dateTime(effectiveLastModifiedAt(spool)) }
  ];
  const items: DetailItem[] = [];
  for (const { key, label, value } of candidates) {
    if (value !== null) {
      items.push({ key, label, value });
    }
  }
  // Die Lieferform steht schon als Symbol in der Zeile darueber - hier nur als Text, falls das Symbol fehlt.
  const packaging = packagingLabel(spool, t);
  if (packaging !== null) {
    items.push({ key: "packaging", label: t("spools.packaging.listLabel"), value: packaging });
  }
  items.push(...customFieldItems(spool, customFieldDefinitions, t));
  const note = spool.note?.trim();
  if (note) {
    items.push({ key: "note", label: t("spools.note"), value: note });
  }
  return items;
}

// Kompakte Detailzeile direkt unter der Spule: "Düse 240–270 °C · Bett 90 °C · ≈ 400 m · 10,19 € · ..."
export function SpoolListDetail({ spool, material, customFieldDefinitions }: SpoolListDetailProps): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  const items = buildDetailItems(spool, material, customFieldDefinitions, { t: (key) => t(key), language: i18n.language });
  if (items.length === 0) {
    return null;
  }
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
      {items.map((item) => (
        <div key={item.key} className={`flex gap-1 ${item.key === "note" ? "max-w-full" : ""}`}>
          <dt className="text-[var(--color-text-muted)]">{item.label}</dt>
          <dd className={`text-[var(--color-text-secondary)] ${item.key === "note" ? "whitespace-pre-wrap break-words" : "whitespace-nowrap"}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
