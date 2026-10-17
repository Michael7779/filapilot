// Cent als Euro-Betrag in der Sprache der Oberflaeche ("12,50 €" bzw. "€12.50")
export function formatEuro(cents: number, locale: string): string {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "EUR" });
}

// Dezimaltrenner fuer Eingabefelder und Text-Export
export function decimalSeparator(locale: string): string {
  return locale.startsWith("de") ? "," : ".";
}
