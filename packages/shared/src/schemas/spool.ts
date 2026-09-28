import { z } from "zod";
import { rawCustomFieldValuesSchema } from "./customField.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const spoolSchema = z.object({
  id: z.string().uuid(),
  materialId: z.string().uuid(),
  manufacturerId: z.string().uuid(),
  // Lager der Spule (in der Datenbank nur wegen der Datenuebernahme optional).
  inventoryId: z.string().uuid().nullable(),
  colorName: z.string().min(1).max(60),
  colorHex: hexColor.nullable(),
  // Zweite Farbe bei zweifarbigem Filament (z.B. Bambu Dual-Color); null = einfarbig.
  colorHex2: hexColor.nullable(),
  initialWeightG: z.number().int().positive(),
  remainingWeightG: z.number().int().min(0),
  // Leergewicht der Spule ohne Filament (g); mit diesem Wert kann "Wiegen" aus dem gemessenen Gesamtgewicht
  // automatisch das Restgewicht errechnen, ohne dass man selbst subtrahieren muss.
  tareWeightG: z.number().int().min(0).nullable(),
  // Vom Server verwaltet (Upload ueber PUT /api/spools/:id/photo), nie vom Client frei setzbar.
  photoUrl: z.string().nullable(),
  purchasePriceCents: z.number().int().min(0).nullable(),
  purchasedAt: z.coerce.date().nullable(),
  location: z.string().max(60).nullable(),
  note: z.string().max(500).nullable(),
  // Werte der Admin-definierten Zusatzfelder (Schluessel = Definitions-ID), bereits gegen die Definitionen geprueft.
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullable()),
  // null = ungeoeffnet (siehe schema.prisma-Kommentar auf Spool.openedAt fuer die Ausloeser).
  openedAt: z.coerce.date().nullable(),
  // Archiviert = nicht mehr im Bestand, aber im Verbrauch weiter gezaehlt. Nur ueber die Archiv-Routen aenderbar.
  archivedAt: z.coerce.date().nullable(),
  archiveReason: z.enum(["MANUAL", "CLOUD_REMOVED"]).nullable(),
  createdAt: z.coerce.date()
});
export type Spool = z.infer<typeof spoolSchema>;

// Beim Anlegen ist das Lager Pflicht; beim Aendern optional (Angabe = in dieses Lager verschieben). customFields
// ist hier nur roh (unbekannte Schluessel erlaubt) - die Route validiert es gegen die bekannten Definitionen
// (Whitelist, siehe validateCustomFieldValues) und macht daraus die geprueften Werte oben.
export const createSpoolInputSchema = spoolSchema
  .omit({
    id: true,
    createdAt: true,
    photoUrl: true,
    inventoryId: true,
    archivedAt: true,
    archiveReason: true,
    customFields: true,
    colorHex2: true,
    note: true,
    tareWeightG: true,
    openedAt: true
  })
  .extend({
    inventoryId: z.string().uuid(),
    // Neuere, optionale Felder: weglassen ist gleichbedeutend mit "kein Wert" (Abwaertskompatibilitaet).
    colorHex2: hexColor.nullable().optional().default(null),
    note: z.string().trim().max(500).nullable().optional().default(null),
    tareWeightG: z.number().int().min(0).nullable().optional().default(null),
    customFields: rawCustomFieldValuesSchema.optional().default({}),
    // Eine manuell angelegte Spule ist standardmaessig ungeoeffnet; true = diese Spule ist schon angebrochen
    // (z.B. bestehender Lagerbestand wird nur nachgetragen). Kein echtes Spool-Feld - die Route macht daraus openedAt.
    alreadyOpened: z.boolean().optional().default(false)
  });
export type CreateSpoolInput = z.infer<typeof createSpoolInputSchema>;

export const updateSpoolInputSchema = createSpoolInputSchema.omit({ alreadyOpened: true }).partial();
export type UpdateSpoolInput = z.infer<typeof updateSpoolInputSchema>;

export const spoolWithRelationsSchema = spoolSchema.extend({
  materialName: z.string(),
  manufacturerName: z.string(),
  inventoryName: z.string().nullable()
});
export type SpoolWithRelations = z.infer<typeof spoolWithRelationsSchema>;

export const LOW_STOCK_THRESHOLD_RATIO = 0.15;

// Archivierte Spulen in Listen: ausblenden (Standard), mit anzeigen oder nur diese.
export const spoolArchiveFilterSchema = z.enum(["exclude", "include", "only"]);
export type SpoolArchiveFilter = z.infer<typeof spoolArchiveFilterSchema>;
