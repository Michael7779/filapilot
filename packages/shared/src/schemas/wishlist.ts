import { z } from "zod";

const colorNameSchema = z.string().trim().min(1).max(60);
// Ganze Cent-Betraege, wie bei den Spulenpreisen (max. 10.000 EUR)
const priceCentsSchema = z.number().int().min(0).max(1_000_000);
const colorHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const wishlistStatusSchema = z.enum(["OPEN", "ORDERED", "DONE"]);
export type WishlistStatus = z.infer<typeof wishlistStatusSchema>;

export const wishlistItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  note: z.string().max(500).nullable(),
  quantity: z.number().int().min(1).max(999),
  status: wishlistStatusSchema,
  // Teil der Bestellliste (aus der Wunschliste ausgewaehlt); der Status gilt fuer beide Ansichten gemeinsam.
  inOrder: z.boolean(),
  // Preis je Spule in Cent fuer die Abrechnung (null = noch nicht eingetragen)
  unitPriceCents: priceCentsSchema.nullable(),
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
    inOrder: z.boolean(),
    unitPriceCents: priceCentsSchema.nullable(),
    manufacturerId: z.string().uuid().nullable(),
    materialId: z.string().uuid().nullable(),
    colorName: colorNameSchema.nullable(),
    colorHex: colorHexSchema.nullable()
  })
  .partial();
export type UpdateWishlistItemInput = z.infer<typeof updateWishlistItemInputSchema>;

// Sammel-Aenderung fuer die Bestellliste: nur Status und Auswahl (beides darf jeder aktive Nutzer), bewusst KEIN Inhalt -
// strict() lehnt Titel/Menge/... ab, sonst liesse sich die Ersteller-Pruefung der Einzel-Route umgehen.
export const BULK_WISHLIST_MAX_IDS = 500;
export const bulkUpdateWishlistInputSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(BULK_WISHLIST_MAX_IDS),
    status: wishlistStatusSchema.optional(),
    inOrder: z.boolean().optional(),
    unitPriceCents: priceCentsSchema.nullable().optional()
  })
  .strict()
  .refine((input) => input.status !== undefined || input.inOrder !== undefined || input.unitPriceCents !== undefined, {
    message: "status, inOrder oder unitPriceCents erforderlich"
  });
export type BulkUpdateWishlistInput = z.infer<typeof bulkUpdateWishlistInputSchema>;

export const CONTENT_FIELDS = ["title", "note", "quantity", "manufacturerId", "materialId", "colorName", "colorHex"] as const;

// Nebenkosten je Hersteller fuer die Abrechnung (Versand und Rabatt in Cent); strict() lehnt fremde Schluessel ab.
export const wishlistOrderCostSchema = z.object({
  manufacturerId: z.string().uuid(),
  shippingCents: priceCentsSchema,
  discountCents: priceCentsSchema
});
export type WishlistOrderCost = z.infer<typeof wishlistOrderCostSchema>;

export const setWishlistOrderCostInputSchema = z.object({ shippingCents: priceCentsSchema, discountCents: priceCentsSchema }).strict();
export type SetWishlistOrderCostInput = z.infer<typeof setWishlistOrderCostInputSchema>;
