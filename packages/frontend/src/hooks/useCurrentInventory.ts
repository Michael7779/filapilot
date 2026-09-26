import type { Inventory, InventoryRole } from "@filapilot/shared";
import { ALL_INVENTORIES, useInventoryStore } from "../stores/useInventoryStore.js";

export interface CurrentInventory {
  // "all" bei der Uebersicht ueber alle Lager, sonst die ID des gewaehlten Lagers, null ohne Lager
  selectedId: string | null;
  isAll: boolean;
  inventory: Inventory | null;
  role: InventoryRole | null;
  canEdit: boolean;
  isOwner: boolean;
}

// Das aktuell gewaehlte Lager samt Rolle. In der Uebersicht "Alle Lager" gibt es keine Schreibrechte.
export function useCurrentInventory(): CurrentInventory {
  const inventories = useInventoryStore((state) => state.inventories);
  const selectedId = useInventoryStore((state) => state.selectedId);
  const isAll = selectedId === ALL_INVENTORIES;
  const inventory = isAll ? null : (inventories.find((entry) => entry.id === selectedId) ?? null);
  const role = inventory?.role ?? null;
  return {
    selectedId,
    isAll,
    inventory,
    role,
    canEdit: role === "OWNER" || role === "EDITOR",
    isOwner: role === "OWNER"
  };
}
