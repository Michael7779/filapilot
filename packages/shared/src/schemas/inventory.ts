import { z } from "zod";

// Feste Farbpalette fuer den Farbpunkt eines Lagers - nie ein frei eingegebener Wert.
export const INVENTORY_COLORS = [
  "#2F6FED",
  "#1D9E75",
  "#D85A30",
  "#7F56D9",
  "#D14343",
  "#C9A227",
  "#8C8C88",
  "#D4537E"
] as const;
export const DEFAULT_INVENTORY_COLOR = INVENTORY_COLORS[0];
export const DEFAULT_INVENTORY_NAME = "Hauptlager";

export const inventoryRoleSchema = z.enum(["OWNER", "EDITOR", "VIEWER"]);
export type InventoryRole = z.infer<typeof inventoryRoleSchema>;

export const inventoryNameSchema = z.string().trim().min(1).max(60);
export const inventoryColorSchema = z.enum(INVENTORY_COLORS);

// Ein Lager aus Sicht des angemeldeten Benutzers (mit seiner Rolle und ein paar Kennzahlen).
export const inventorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  role: inventoryRoleSchema,
  spoolCount: z.number().int().min(0),
  printerCount: z.number().int().min(0),
  memberCount: z.number().int().min(0)
});
export type Inventory = z.infer<typeof inventorySchema>;

export const createInventoryInputSchema = z.object({
  name: inventoryNameSchema,
  color: inventoryColorSchema.default(DEFAULT_INVENTORY_COLOR)
});
export type CreateInventoryInput = z.infer<typeof createInventoryInputSchema>;

export const updateInventoryInputSchema = z
  .object({ name: inventoryNameSchema, color: inventoryColorSchema })
  .partial();
export type UpdateInventoryInput = z.infer<typeof updateInventoryInputSchema>;

// Zum Loeschen muss der Name des Lagers exakt mitgeschickt werden (Schutz vor versehentlichem Aufruf).
export const deleteInventoryInputSchema = z.object({ confirmName: z.string() });
export type DeleteInventoryInput = z.infer<typeof deleteInventoryInputSchema>;

export const inventoryMemberSchema = z.object({
  userId: z.string().uuid(),
  username: z.string(),
  role: inventoryRoleSchema
});
export type InventoryMember = z.infer<typeof inventoryMemberSchema>;

export const addInventoryMemberInputSchema = z.object({
  userId: z.string().uuid(),
  role: inventoryRoleSchema
});
export type AddInventoryMemberInput = z.infer<typeof addInventoryMemberInputSchema>;

export const updateInventoryMemberInputSchema = z.object({ role: inventoryRoleSchema });
export type UpdateInventoryMemberInput = z.infer<typeof updateInventoryMemberInputSchema>;

export const memberCandidateSchema = z.object({ id: z.string().uuid(), username: z.string() });
export type MemberCandidate = z.infer<typeof memberCandidateSchema>;

// Alle Spulen (auch archivierte) eines Lagers in ein anderes Lager verschieben.
export const moveSpoolsInputSchema = z.object({ targetInventoryId: z.string().uuid() });
export type MoveSpoolsInput = z.infer<typeof moveSpoolsInputSchema>;
export interface MoveSpoolsResult {
  moved: number;
}
