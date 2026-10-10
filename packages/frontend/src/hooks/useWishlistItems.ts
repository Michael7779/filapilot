import { useCallback, useEffect, useState } from "react";
import type { WishlistItem } from "@filapilot/shared";
import { apiRequest } from "../lib/api.js";

// Die instanzweite Wunschliste, um an der Spulen-Seite zu zeigen, welche Spulen schon draufstehen. Ein Ladefehler ist
// nicht kritisch (dann gelten alle Spulen als "noch nicht drauf"); doppelte Eintraege wuerde nur die Liste selbst zeigen.
export function useWishlistItems(): { items: WishlistItem[]; reload: () => Promise<void> } {
  const [items, setItems] = useState<WishlistItem[]>([]);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setItems(await apiRequest<WishlistItem[]>("/wishlist"));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, reload };
}
