import { z } from "zod";

export const wishlistStatusSchema = z.enum(["OPEN", "ORDERED", "DONE"]);
export type WishlistStatus = z.infer<typeof wishlistStatusSchema>;

export const wishlistItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  note: z.string().max(500).nullable(),
  quantity: z.number().int().min(1).max(999),
  status: wishlistStatusSchema,
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
  quantity: z.number().int().min(1).max(999).default(1)
});
export type CreateWishlistItemInput = z.infer<typeof createWishlistItemInputSchema>;

// Inhalt (Titel/Notiz/Menge) darf nur der Ersteller oder ein Admin aendern; den Status darf jeder aktive Nutzer
// setzen (Sammelbestellung: jeder markiert "bestellt"/"erledigt"). Die Route prueft das getrennt.
export const updateWishlistItemInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).nullable(),
    quantity: z.number().int().min(1).max(999),
    status: wishlistStatusSchema
  })
  .partial();
export type UpdateWishlistItemInput = z.infer<typeof updateWishlistItemInputSchema>;

export const CONTENT_FIELDS = ["title", "note", "quantity"] as const;
