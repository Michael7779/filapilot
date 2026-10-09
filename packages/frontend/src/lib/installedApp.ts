// "Installiert" = als Homescreen-App geoeffnet (iOS: navigator.standalone, sonst display-mode: standalone), nicht im
// normalen Browser-Tab. navigator.standalone ist eine iOS-eigene Eigenschaft und steht nicht in den TypeScript-DOM-Typen,
// deshalb ohne Typ-Cast ueber Reflect.get gelesen.
export function isInstalledWebApp(win: Pick<Window, "navigator" | "matchMedia"> | undefined = typeof window === "undefined" ? undefined : window): boolean {
  if (!win) {
    return false;
  }
  if (Reflect.get(win.navigator, "standalone") === true) {
    return true;
  }
  return typeof win.matchMedia === "function" && win.matchMedia("(display-mode: standalone)").matches;
}
