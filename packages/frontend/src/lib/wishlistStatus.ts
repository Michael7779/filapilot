import type { WishlistStatus } from "@filapilot/shared";

export const STATUS_ORDER: WishlistStatus[] = ["OPEN", "ORDERED", "DONE"];
export const STATUS_STYLE: Record<WishlistStatus, { bg: string; fg: string }> = {
  OPEN: { bg: "var(--color-bg)", fg: "var(--color-text-secondary)" },
  ORDERED: { bg: "#e4edfd", fg: "#1f4fb8" },
  DONE: { bg: "#e3f4e8", fg: "#1a6b3a" }
};
