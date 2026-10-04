import { useTranslation } from "react-i18next";
import type { Material } from "@filapilot/shared";

const INPUT_CLASS = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";
const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";

export function centsToEuroInput(cents: number | null): string {
  return cents === null ? "" : String(cents / 100);
}

// Leeres Feld = kein Richtpreis; sonst ganze Cent (die Route lehnt negative oder krumme Werte ab).
export function euroInputToCents(value: string): number | null {
  return value.trim() ? Math.round(Number(value) * 100) : null;
}

// "11,99 € mit Spule · 10,19 € Nachfüllung" fuer die Materialliste; leer, wenn kein Richtpreis hinterlegt ist.
export function priceSummary(material: Pick<Material, "priceRefillCents" | "priceWithSpoolCents">, locale: string, t: (key: string) => string): string {
  const euro = (cents: number): string => (cents / 100).toLocaleString(locale, { style: "currency", currency: "EUR" });
  const parts = [
    material.priceWithSpoolCents === null ? null : `${euro(material.priceWithSpoolCents)} ${t("spools.packaging.withSpoolShort")}`,
    material.priceRefillCents === null ? null : `${euro(material.priceRefillCents)} ${t("spools.packaging.refill")}`
  ].filter((part) => part !== null);
  return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
}

interface MaterialPriceFieldsProps {
  priceWithSpool: string;
  priceRefill: string;
  onWithSpoolChange: (value: string) => void;
  onRefillChange: (value: string) => void;
}

// Richtpreise je Spule im Material-Dialog (Stammdaten): Vorbelegung des Kaufpreises beim Anlegen einer Spule.
export function MaterialPriceFields({ priceWithSpool, priceRefill, onWithSpoolChange, onRefillChange }: MaterialPriceFieldsProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex gap-2">
        <label className={`min-w-0 flex-1 ${LABEL_CLASS}`}>
          {t("catalog.priceWithSpool")}
          <input type="number" step="0.01" min="0" value={priceWithSpool} onChange={(e) => onWithSpoolChange(e.target.value)} className={INPUT_CLASS} />
        </label>
        <label className={`min-w-0 flex-1 ${LABEL_CLASS}`}>
          {t("catalog.priceRefill")}
          <input type="number" step="0.01" min="0" value={priceRefill} onChange={(e) => onRefillChange(e.target.value)} className={INPUT_CLASS} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-[var(--color-text-muted)]">{t("catalog.priceHint")}</p>
    </>
  );
}
