import { useState } from "react";
import { isInstalledWebApp } from "../lib/installedApp.js";

// Unsichtbarer, fester Streifen am oberen Rand der installierten Web-App (iOS 26/27).
// Hintergrund: Seit iOS 26 ("Liquid Glass") legt iOS einen Unschaerfe-Verlauf ueber den oberen Rand einer als
// Homescreen-App installierten Web-Seite, wenn WebKit dort kein festes, deckendes Element mit abtastbarer Farbe findet
// (nicht von Apple dokumentiert; Ansatz nach FreshRSS PR 9382). Der Streifen liefert genau dieses Element: Hintergrund =
// Seitenhintergrund (--color-bg, dieselbe Variable wie <body>, damit er Seite und Statusleiste farblich nie widerspricht),
// aber background-clip:text bei transparenter Textfarbe und ohne Text - es wird nichts gezeichnet.
// Nur im installierten Modus; im Browser-Tab, im Simulator und in Chromium laesst sich der Effekt nicht nachstellen.
export function InstalledAppTopStrip(): React.JSX.Element | null {
  const [installed] = useState(() => isInstalledWebApp());
  if (!installed) {
    return null;
  }
  return <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[11px] bg-[var(--color-bg)] bg-clip-text text-transparent" />;
}
