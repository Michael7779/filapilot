import ExcelJS from "exceljs";
import type { SpoolWithRelations } from "@filapilot/shared";
import { estimateRemainingLengthM } from "@filapilot/shared";

type CellValue = string | number | Date | null;

interface ExportColumn {
  header: string;
  width: number;
  // Rohwert (Zahl/Datum bleiben Zahl/Datum - fuer Excel, das damit sortieren/rechnen kann).
  value: (spool: SpoolWithRelations, diameterMm: number | null, densityGCm3: number | null) => CellValue;
}

function remainingLengthM(spool: SpoolWithRelations, diameterMm: number | null, densityGCm3: number | null): number | null {
  const meters = estimateRemainingLengthM(spool.remainingWeightG, densityGCm3, diameterMm ?? undefined);
  return meters === null ? null : Math.round(meters);
}

function refillCell(spool: SpoolWithRelations): CellValue {
  if (spool.openedAt) {
    return null;
  }
  return spool.isRefill ? "ja" : "nein";
}

const COLUMNS: ExportColumn[] = [
  { header: "Hersteller", width: 16, value: (spool) => spool.manufacturerName },
  { header: "Material", width: 16, value: (spool) => spool.materialName },
  { header: "Farbe", width: 14, value: (spool) => spool.colorName },
  { header: "Farbcode", width: 10, value: (spool) => spool.colorHex ?? null },
  { header: "Zweite Farbe", width: 10, value: (spool) => spool.colorHex2 ?? null },
  { header: "Ursprungsgewicht (g)", width: 12, value: (spool) => spool.initialWeightG },
  { header: "Restgewicht (g)", width: 12, value: (spool) => spool.remainingWeightG },
  { header: "Restlaenge (m, ungefaehr)", width: 14, value: remainingLengthM },
  { header: "Lagerort", width: 14, value: (spool) => spool.location ?? null },
  { header: "Kaufpreis (EUR)", width: 12, value: (spool) => (spool.purchasePriceCents === null ? null : spool.purchasePriceCents / 100) },
  // Nur bei ungeoeffneten Spulen gefuellt (angebrochene Spulen: leer)
  { header: "Nachfuellung", width: 12, value: refillCell },
  { header: "Gekauft am", width: 12, value: (spool) => (spool.purchasedAt ? new Date(spool.purchasedAt) : null) },
  { header: "Hinzugefuegt am", width: 14, value: (spool) => new Date(spool.createdAt) },
  { header: "Notiz", width: 24, value: (spool) => spool.note ?? null },
  { header: "Lager", width: 14, value: (spool) => spool.inventoryName ?? null },
  { header: "Archiviert", width: 10, value: (spool) => (spool.archivedAt ? "ja" : "nein") }
];

function toCsvText(value: CellValue): string {
  if (value === null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  // Deutsches Dezimaltrennzeichen (Komma), passend zum Semikolon-Trennzeichen der Datei.
  return typeof value === "number" ? String(value).replace(".", ",") : value;
}

// Semikolon statt Komma: Excel mit deutscher Spracheinstellung oeffnet eine per Doppelklick geladene CSV-Datei
// sonst als eine einzige Spalte (der "Listentrennzeichen"-Systemwert ist unter Windows/Deutsch das Semikolon).
const DELIMITER = ";";

// Ein Feld mit Trennzeichen, Anfuehrungszeichen oder Zeilenumbruch wird in Anfuehrungszeichen gesetzt (RFC 4180).
function csvField(value: string): string {
  return new RegExp(`["${DELIMITER}\n]`).test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function rowValues(spool: SpoolWithRelations, diameterMm: number | null, densityGCm3: number | null): CellValue[] {
  return COLUMNS.map((column) => column.value(spool, diameterMm, densityGCm3));
}

// Kein CSV-Paket noetig: die Spalten sind fest bekannt und Werte enthalten keine komplexen Strukturen.
export function spoolsToCsv(spools: readonly SpoolWithRelations[], densityByMaterialId: Map<string, number | null>, diameterByMaterialId: Map<string, number | null>): string {
  const header = COLUMNS.map((column) => csvField(column.header)).join(DELIMITER);
  const rows = spools.map((spool) =>
    rowValues(spool, diameterByMaterialId.get(spool.materialId) ?? null, densityByMaterialId.get(spool.materialId) ?? null)
      .map((value) => csvField(toCsvText(value)))
      .join(DELIMITER)
  );
  return [header, ...rows].join("\r\n");
}

// Echtes .xlsx (kein CSV mit anderer Endung) - Zahlen und Daten bleiben Zahl/Datum, damit Excel damit sortieren/rechnen
// kann. Baut die Datei im Speicher auf (kein Datei-Schreibvorgang im Request-Handler).
export async function spoolsToXlsx(
  spools: readonly SpoolWithRelations[],
  densityByMaterialId: Map<string, number | null>,
  diameterByMaterialId: Map<string, number | null>
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Spulen");
  sheet.columns = COLUMNS.map((column) => ({ header: column.header, width: column.width }));
  sheet.getRow(1).font = { bold: true };
  for (const spool of spools) {
    sheet.addRow(rowValues(spool, diameterByMaterialId.get(spool.materialId) ?? null, densityByMaterialId.get(spool.materialId) ?? null));
  }
  const dateColumns = COLUMNS.flatMap((column, index) => (column.header === "Gekauft am" || column.header === "Hinzugefuegt am" ? [index + 1] : []));
  for (const columnIndex of dateColumns) {
    sheet.getColumn(columnIndex).numFmt = "yyyy-mm-dd";
  }
  return workbook.xlsx.writeBuffer();
}
