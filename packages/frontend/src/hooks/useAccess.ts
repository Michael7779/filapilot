import { userAccess, type UserAccess } from "@filapilot/shared";
import { useAuthStore } from "../stores/useAuthStore.js";

const NO_ACCESS: UserAccess = { filament: false, sizzle: false };

// Was das angemeldete Konto sehen darf (Super-Admins immer alles). Nur fuer die Anzeige; der Server prueft es bei jeder Anfrage.
export function useAccess(): UserAccess {
  const user = useAuthStore((state) => state.user);
  return user ? userAccess(user) : NO_ACCESS;
}
