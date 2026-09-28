import { z } from "zod";

// Rohdaten eines Spoolman-Exports (https://donkie.github.io/Spoolman/, Endpunkt GET /api/v1/spool). Die Feldnamen
// stammen aus der oeffentlichen API-Dokumentation, sind aber NICHT gegen eine echte Spoolman-Installation geprueft
// (siehe Offene Punkte in docs/requirements/spoolman-import.md) - deshalb wird jeder Eintrag einzeln und robust
// geprueft: Unbekanntes/Fehlendes fuehrt nie zum Absturz, sondern der Eintrag wird gezaehlt und uebersprungen.
const spoolmanVendorSchema = z
  .object({
    name: z.string().max(120).nullish()
  })
  .nullish();

const spoolmanFilamentSchema = z
  .object({
    name: z.string().max(160).nullish(),
    material: z.string().max(60).nullish(),
    density: z.number().finite().positive().nullish(),
    diameter: z.number().finite().positive().nullish(),
    weight: z.number().finite().nullish(),
    spool_weight: z.number().finite().nullish(),
    color_hex: z.string().max(20).nullish(),
    settings_extruder_temp: z.number().finite().nullish(),
    settings_bed_temp: z.number().finite().nullish(),
    vendor: spoolmanVendorSchema
  })
  .nullish();

export const spoolmanSpoolSchema = z.object({
  id: z.union([z.number().int(), z.string().min(1)]).transform((value) => String(value)),
  remaining_weight: z.number().finite().nullish(),
  used_weight: z.number().finite().nullish(),
  initial_weight: z.number().finite().nullish(),
  spool_weight: z.number().finite().nullish(),
  location: z.string().max(120).nullish(),
  comment: z.string().max(500).nullish(),
  filament: spoolmanFilamentSchema
});
export type SpoolmanSpool = z.infer<typeof spoolmanSpoolSchema>;

// Max. 2000 Eintraege pro Datei - grosszuegig fuer eine einzelne Spoolman-Instanz, aber eine feste Obergrenze.
export const spoolmanFileInputSchema = z.object({
  spools: z.array(z.unknown()).max(2000)
});
export type SpoolmanFileInput = z.infer<typeof spoolmanFileInputSchema>;

export interface SpoolmanImportSummary {
  created: number;
  updated: number;
  skipped: number;
  manufacturersCreated: number;
  materialsCreated: number;
  // Mit einer bestehenden ungeoeffneten Spule verknuepft statt neu angelegt (siehe BambuSyncSummary.linked) -
  // Spoolman-Import hat keine Auswahl/Rueckfrage, darum still bei eindeutigem Treffer.
  linked: number;
}
