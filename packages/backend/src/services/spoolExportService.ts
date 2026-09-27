import type { SpoolWithRelations } from "@filapilot/shared";
import { estimateRemainingLengthM } from "@filapilot/shared";

const CSV_COLUMNS: { header: string; value: (spool: SpoolWithRelations, diameterMm: number | null, densityGCm3: number | null) => string }[] = [
  { header: "Hersteller", value: (spool) => spool.manufacturerName },
  { header: "Material", value: (spool) => spool.materialName },
  { header: "Farbe", value: (spool) => spool.colorName },
  { header: "Farbcode", value: (spool) => spool.colorHex ?? "" },
  { header: "Zweite Farbe", value: (spool) => spool.colorHex2 ?? "" },
  { header: "Ursprungsgewicht (g)", value: (spool) => String(spool.initialWeightG) },
  { header: "Restgewicht (g)", value: (spool) => String(spool.remainingWeightG) },
  {
    header: "Restlaenge (m, ungefaehr)",
    value: (spool, diameterMm, densityGCm3) => {
      const meters = estimateRemainingLengthM(spool.remainingWeightG, densityGCm3, diameterMm ?? undefined);
      return meters === null ? "" : String(Math.round(meters));
    }
  },
  { header: "Lagerort", value: (spool) => spool.location ?? "" },
  { header: "Kaufpreis (EUR)", value: (spool) => (spool.purchasePriceCents === null ? "" : (spool.purchasePriceCents / 100).toFixed(2).replace(".", ",")) },
  { header: "Gekauft am", value: (spool) => (spool.purchasedAt ? new Date(spool.purchasedAt).toISOString().slice(0, 10) : "") },
  { header: "Hinzugefuegt am", value: (spool) => new Date(spool.createdAt).toISOString().slice(0, 10) },
  { header: "Notiz", value: (spool) => spool.note ?? "" },
  { header: "Lager", value: (spool) => spool.inventoryName ?? "" },
  { header: "Archiviert", value: (spool) => (spool.archivedAt ? "ja" : "nein") }
];

// Semikolon statt Komma: Excel mit deutscher Spracheinstellung oeffnet eine per Doppelklick geladene CSV-Datei
// sonst als eine einzige Spalte (der "Listentrennzeichen"-Systemwert ist unter Windows/Deutsch das Semikolon).
const DELIMITER = ";";

// Ein Feld mit Trennzeichen, Anfuehrungszeichen oder Zeilenumbruch wird in Anfuehrungszeichen gesetzt (RFC 4180).
function csvField(value: string): string {
  return new RegExp(`["${DELIMITER}\n]`).test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

// Kein CSV-Paket noetig: die Spalten sind fest bekannt und Werte enthalten keine komplexen Strukturen.
export function spoolsToCsv(spools: readonly SpoolWithRelations[], densityByMaterialId: Map<string, number | null>, diameterByMaterialId: Map<string, number | null>): string {
  const header = CSV_COLUMNS.map((column) => csvField(column.header)).join(DELIMITER);
  const rows = spools.map((spool) =>
    CSV_COLUMNS.map((column) => csvField(column.value(spool, diameterByMaterialId.get(spool.materialId) ?? null, densityByMaterialId.get(spool.materialId) ?? null))).join(
      DELIMITER
    )
  );
  return [header, ...rows].join("\r\n");
}
