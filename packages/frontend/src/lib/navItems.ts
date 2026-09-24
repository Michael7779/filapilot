export const NAV_ITEMS = [
  { key: "dashboard", href: "/", enabled: true },
  { key: "spools", href: "/spools", enabled: true },
  { key: "printers", href: "/printers", enabled: true },
  { key: "stats", href: "/stats", enabled: true },
  { key: "settings", href: "/settings", enabled: true }
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
