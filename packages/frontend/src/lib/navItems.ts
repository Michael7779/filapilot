import type { UserAccess } from "@filapilot/shared";

// area: zu welcher Freigabe der Punkt gehoert (null = immer sichtbar, z.B. Einstellungen mit dem eigenen Konto)
export const NAV_ITEMS = [
  { key: "dashboard", href: "/", enabled: true, area: "filament" },
  { key: "spools", href: "/spools", enabled: true, area: "filament" },
  { key: "printers", href: "/printers", enabled: true, area: "filament" },
  { key: "stats", href: "/stats", enabled: true, area: "filament" },
  { key: "wunschliste", href: "/wunschliste", enabled: true, area: "filament" },
  { key: "sizzle", href: "/sizzle", enabled: true, area: "sizzle" },
  { key: "settings", href: "/settings", enabled: true, area: null }
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];
export type NavItem = (typeof NAV_ITEMS)[number];

// Die Menuepunkte, die zu den Freigaben des Kontos passen. Das ist nur die Anzeige - durchgesetzt wird es auf dem Server.
export function visibleNavItems(access: UserAccess): NavItem[] {
  return NAV_ITEMS.filter((item) => item.area === null || access[item.area]);
}

// Startseite nach der Anmeldung: die erste freigegebene
export function homePath(access: UserAccess): string {
  if (access.filament) {
    return "/";
  }
  return access.sizzle ? "/sizzle" : "/settings";
}

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
