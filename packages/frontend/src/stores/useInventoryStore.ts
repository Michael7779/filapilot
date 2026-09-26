import { create } from "zustand";
import type { Inventory } from "@filapilot/shared";
import { apiRequest } from "../lib/api.js";

// Auswahl "Alle Lager" (nur lesen) - sonst die ID eines Lagers.
export const ALL_INVENTORIES = "all";
const STORAGE_KEY = "fp_inventory";

function readStoredSelection(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSelection(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Speicher blockiert (z.B. privates Fenster): die Auswahl gilt dann nur bis zum Neuladen.
  }
}

// Gueltige Auswahl bestimmen: gemerktes Lager, sonst das erste; "Alle Lager" nur bei mindestens zwei Lagern.
export function resolveSelection(inventories: readonly Inventory[], wanted: string | null): string | null {
  if (inventories.length === 0) {
    return null;
  }
  if (wanted === ALL_INVENTORIES && inventories.length > 1) {
    return ALL_INVENTORIES;
  }
  if (wanted && inventories.some((inventory) => inventory.id === wanted)) {
    return wanted;
  }
  return inventories[0]?.id ?? null;
}

interface InventoryState {
  inventories: Inventory[];
  loaded: boolean;
  selectedId: string | null;
  load: () => Promise<void>;
  select: (id: string) => void;
  reset: () => void;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventories: [],
  loaded: false,
  selectedId: null,
  load: async () => {
    const inventories = await apiRequest<Inventory[]>("/inventories");
    const wanted = get().selectedId ?? readStoredSelection();
    set({ inventories, loaded: true, selectedId: resolveSelection(inventories, wanted) });
  },
  select: (id) => {
    set({ selectedId: resolveSelection(get().inventories, id) });
    storeSelection(id);
  },
  reset: () => set({ inventories: [], loaded: false, selectedId: null })
}));
