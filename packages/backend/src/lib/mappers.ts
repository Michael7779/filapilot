import type { User } from "@prisma/client";
import type { UserPublic } from "@filapilot/shared";

// Mappt explizit Feld fuer Feld - nie ein rohes Prisma-Objekt an den Client (kein passwordHash,
// kein resetToken).
export function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    themeAccentColor: user.themeAccentColor,
    createdAt: user.createdAt
  };
}
