import { useTranslation } from "react-i18next";
import { formatEuro } from "../lib/formatEuro.js";
import { EuroField } from "./EuroField.js";

interface WishlistPriceFieldProps {
  // Menge, auf die sich die Summe bezieht (ausgewaehlte Menge der Zeile)
  quantity: number;
  unitPriceCents: number | null;
  // Die Eintraege der Zeile haben verschiedene bzw. teils fehlende Preise; eine Eingabe gilt dann fuer alle
  mixed: boolean;
  // Richtpreis des Materials aus den Stammdaten (falls vorhanden), nur als Vorschlag
  suggestionCents: number | null;
  onChange: (cents: number | null) => void;
}

// Preis je Spule in der Bestellliste, mit Summe der Zeile (Menge mal Preis) und Vorschlag aus den Stammdaten.
export function WishlistPriceField({ quantity, unitPriceCents, mixed, suggestionCents, onChange }: WishlistPriceFieldProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <EuroField label={t("wishlist.price.label")} cents={unitPriceCents} onCommit={onChange} />
      {unitPriceCents !== null && (
        <span className="pb-1.5 text-sm font-medium tabular-nums">
          {t("wishlist.price.lineTotal", { quantity, total: formatEuro(quantity * unitPriceCents, i18n.language) })}
        </span>
      )}
      {mixed && <span className="pb-1.5 text-xs text-[var(--color-danger)]">{t("wishlist.price.mixed")}</span>}
      {unitPriceCents === null && !mixed && suggestionCents !== null && (
        <button type="button" onClick={() => onChange(suggestionCents)} className="pb-1.5 text-xs font-medium" style={{ color: "var(--accent)" }}>
          {t("wishlist.price.suggestion", { price: formatEuro(suggestionCents, i18n.language) })}
        </button>
      )}
    </div>
  );
}
