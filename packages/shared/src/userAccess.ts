import type { UserPublic } from "./schemas/user.js";

export type AccessFlags = Pick<UserPublic, "isSuperAdmin" | "canUseFilament" | "canUseSizzle">;

export interface UserAccess {
  filament: boolean;
  sizzle: boolean;
}

// Was ein Benutzer sehen darf: ein Super-Admin immer beides, alle anderen nur, was freigegeben ist. Die Oberflaeche richtet
// Menue und Startseite danach aus; durchgesetzt wird es auf dem Server (middleware/access.ts), nie nur hier.
export function userAccess(user: AccessFlags): UserAccess {
  return {
    filament: user.isSuperAdmin || user.canUseFilament,
    sizzle: user.isSuperAdmin || user.canUseSizzle
  };
}
