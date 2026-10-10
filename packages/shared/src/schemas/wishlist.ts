import { z } from "zod";

const colorNameSchema = z.string().trim().min(1).max(60);
const colorHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const wishlistStatusSchema = z.enum(["OPEN", "ORDERED", "DONE"]);
export type WishlistStatus = z.infer<typeof wishlistStatusSchema>;

export const wishlistItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  note: z.string().max(500).nullable(),
  quantity: z.number().int().min(1).max(999),
  status: wishlistStatusSchema,
  // Optionaler Verweis auf einen Stammdaten-Eintrag (aus den Dropdowns im Formular); der Titel bleibt die
  // massgebliche, frei editierbare Anzeige. Name als Momentaufnahme, damit er auch nach Loeschen lesbar bleibt.
  manufacturerId: z.string().uuid().nullable(),
  manufacturerName: z.string().nullable(),
  materialId: z.string().uuid().nullable(),
  materialName: z.string().nullable(),
  // Optionale Wunschfarbe (aus der Farbauswahl des Formulars, wie bei einer Spule); reiner Text, kein Katalog-Verweis,
  // weil Farben nicht in der Datenbank gepflegt werden (siehe manufacturerColorCatalog.ts).
  colorName: colorNameSchema.nullable(),
  colorHex: colorHexSchema.nullable(),
  addedByUserId: z.string().uuid().nullable(),
  addedByName: z.string(),
  createdAt: z.coerce.date(),
  updatedByName: z.string().nullable(),
  updatedAt: z.coerce.date()
});
export type WishlistItem = z.infer<typeof wishlistItemSchema>;

export const createWishlistItemInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).nullable().default(null),
  quantity: z.number().int().min(1).max(999).default(1),
  manufacturerId: z.string().uuid().nullable().optional().default(null),
  materialId: z.string().uuid().nullable().optional().default(null),
  colorName: colorNameSchema.nullable().optional().default(null),
  colorHex: colorHexSchema.nullable().optional().default(null)
});
export type CreateWishlistItemInput = z.infer<typeof createWishlistItemInputSchema>;

// Inhalt (Titel/Notiz/Menge/Verweis) darf nur der Ersteller oder ein Admin aendern; den Status darf jeder aktive
// Nutzer setzen (Sammelbestellung: jeder markiert "bestellt"/"erledigt"). Die Route prueft das getrennt.
export const updateWishlistItemInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).nullable(),
    quantity: z.number().int().min(1).max(999),
    status: wishlistStatusSchema,
    manufacturerId: z.string().uuid().nullable(),
    materialId: z.string().uuid().nullable(),
    colorName: colorNameSchema.nullable(),
    colorHex: colorHexSchema.nullable()
  })
  .partial();
export type UpdateWishlistItemInput = z.infer<typeof updateWishlistItemInputSchema>;

export const CONTENT_FIELDS = ["title", "note", "quantity", "manufacturerId", "materialId", "colorName", "colorHex"] as const;
