import { z } from "zod";
import { wishlistStatusSchema } from "./wishlist.js";

// Ganze Cent-Betraege, wie bei den Spulenpreisen (max. 10.000 EUR)
const priceCentsSchema = z.number().int().min(0).max(1_000_000);

// Eine Variante eines Produkts aus dem Shop https://sizzlebrothers.de (z.B. "Burger & Ribs BBQ-Sauce" in "500 ml").
export const sizzleProductSchema = z.object({
  id: z.string().uuid(),
  // Gemeinsame Kennung aller Varianten eines Produkts (zum Gruppieren in der Auswahl)
  productKey: z.string(),
  title: z.string(),
  variantTitle: z.string().nullable(),
  productType: z.string().nullable(),
  // Kleines Bild (https) vom Shop
  imageUrl: z.string().nullable(),
  // Seite des Produkts im Shop
  url: z.string(),
  priceCents: priceCentsSchema,
  available: z.boolean(),
  // false = nicht mehr im Shop; bestehende Wuensche bleiben lesbar, neue sind nicht moeglich
  active: z.boolean()
});
export type SizzleProduct = z.infer<typeof sizzleProductSchema>;

export interface SizzleCatalog {
  products: SizzleProduct[];
  // Zeitpunkt des letzten erfolgreichen Abgleichs mit dem Shop (null = noch nie)
  syncedAt: Date | null;
}

export const sizzleWishSchema = z.object({
  id: z.string().uuid(),
  product: sizzleProductSchema,
  quantity: z.number().int().min(1).max(999),
  note: z.string().max(500).nullable(),
  status: wishlistStatusSchema,
  // Teil der Bestellliste; dort ist der Preis massgeblich
  inOrder: z.boolean(),
  // Eingefrorener/angepasster Preis je Stueck in der Bestellliste (null = Shop-Preis des Produkts)
  unitPriceCents: priceCentsSchema.nullable(),
  addedByUserId: z.string().uuid().nullable(),
  addedByName: z.string(),
  createdAt: z.coerce.date(),
  updatedByName: z.string().nullable(),
  updatedAt: z.coerce.date()
});
export type SizzleWish = z.infer<typeof sizzleWishSchema>;

export const createSizzleWishInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999).default(1),
  note: z.string().trim().max(500).nullable().default(null)
});
export type CreateSizzleWishInput = z.infer<typeof createSizzleWishInputSchema>;

// Inhalt (Produkt/Menge/Notiz) darf nur der Ersteller oder ein Admin aendern; Status, Auswahl und Preis darf jeder
// Freigegebene setzen (Sammelbestellung). Die Route prueft das getrennt.
export const updateSizzleWishInputSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999),
    note: z.string().trim().max(500).nullable(),
    status: wishlistStatusSchema,
    inOrder: z.boolean(),
    unitPriceCents: priceCentsSchema.nullable()
  })
  .partial();
export type UpdateSizzleWishInput = z.infer<typeof updateSizzleWishInputSchema>;

// Aktualisierung anstossen: auto = beim Oeffnen der Seite (nur wenn der letzte Abgleich laenger als die Mindestpause her ist),
// sonst per Knopf (immer). strict() lehnt fremde Schluessel ab.
export const sizzleRefreshRequestSchema = z.object({ auto: z.boolean().optional().default(false) }).strict();
export type SizzleRefreshRequest = z.infer<typeof sizzleRefreshRequestSchema>;

export const SIZZLE_CONTENT_FIELDS = ["productId", "quantity", "note"] as const;

// Versand und Rabatt der SizzleBrothers-Bestellung: Versand und Rabatt als Gesamtbetrag (ganze Cent) sowie ein Prozent-Rabatt auf die
// Ware (Hundertstel-Prozent: 10 % = 1000). Alles wird in der Abrechnung nach Warenwert auf die Personen verteilt.
const basisPointsSchema = z.number().int().min(0).max(10_000);
export const sizzleOrderCostSchema = z.object({ shippingCents: priceCentsSchema, discountCents: priceCentsSchema, discountBp: basisPointsSchema });
export type SizzleOrderCost = z.infer<typeof sizzleOrderCostSchema>;

// Eingabe: discountBp darf fehlen (aeltere Oberflaeche) - dann bleibt der gespeicherte Wert. strict() lehnt fremde Schluessel ab.
export const setSizzleOrderCostInputSchema = z.object({ shippingCents: priceCentsSchema, discountCents: priceCentsSchema, discountBp: basisPointsSchema.optional() }).strict();
export type SetSizzleOrderCostInput = z.infer<typeof setSizzleOrderCostInputSchema>;

// Sammel-Aenderung fuer die Bestellliste: nur Status, Auswahl und Preis, bewusst KEIN Inhalt - strict() lehnt Produkt/Menge/
// Notiz ab, sonst liesse sich die Ersteller-Pruefung der Einzel-Route umgehen.
export const BULK_SIZZLE_MAX_IDS = 500;
export const bulkUpdateSizzleWishesInputSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(BULK_SIZZLE_MAX_IDS),
    status: wishlistStatusSchema.optional(),
    inOrder: z.boolean().optional(),
    unitPriceCents: priceCentsSchema.nullable().optional()
  })
  .strict()
  .refine((input) => input.status !== undefined || input.inOrder !== undefined || input.unitPriceCents !== undefined, {
    message: "status, inOrder oder unitPriceCents erforderlich"
  });
export type BulkUpdateSizzleWishesInput = z.infer<typeof bulkUpdateSizzleWishesInputSchema>;
