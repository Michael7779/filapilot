import type { ConsumptionStats } from "@filapilot/shared";

// Gleiches Format wie der Spulen-Export (spoolExportService.ts): Semikolon-Trennzeichen und deutsches
// Dezimaltrennzeichen fuer Excel mit deutscher Spracheinstellung.
const DELIMITER = ";";

function csvField(value: string): string {
  return new RegExp(`["${DELIMITER}\n]`).test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function euro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function section(title: string, header: string[], rows: string[][]): string[] {
  return [csvField(title), header.map(csvField).join(DELIMITER), ...rows.map((row) => row.map(csvField).join(DELIMITER))];
}

// Ein Zeitabschnitt je Zeile, danach die Aufschluesselungen nach Material-Typ/Hersteller/Drucker - alles in einer
// Datei, durch eine Leerzeile getrennt (kein CSV-Paket noetig, wie beim Spulen-Export).
export function consumptionToCsv(stats: ConsumptionStats): string {
  const lines: string[] = [
    ...section(
      "Verbrauch je Zeitabschnitt",
      ["Zeitabschnitt", "Verbrauch (g)", "Kosten (EUR)"],
      stats.buckets.map((bucket) => [bucket.key, String(bucket.consumedG), euro(bucket.costCents)])
    ),
    "",
    ["Gesamt", `${stats.totals.consumedG} g`, `${euro(stats.totals.costCents)} EUR`].map(csvField).join(DELIMITER),
    ["Vorzeitraum", `${stats.previousTotals.consumedG} g`, `${euro(stats.previousTotals.costCents)} EUR`].map(csvField).join(DELIMITER),
    ""
  ];
  const breakdowns: [string, ConsumptionStats["byType"]][] = [
    ["Verbrauch nach Material-Typ", stats.byType],
    ["Verbrauch nach Hersteller", stats.byManufacturer],
    ["Verbrauch nach Drucker", stats.byPrinter]
  ];
  for (const [title, entries] of breakdowns) {
    lines.push(...section(title, ["Bezeichnung", "Verbrauch (g)"], entries.map((entry) => [entry.label, String(entry.consumedG)])), "");
  }
  return lines.join("\r\n");
}
