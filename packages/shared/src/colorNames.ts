import { getColorPresets } from "./manufacturerColorCatalog.js";

// Feste Liste deutscher Farbnamen fuer den Import: Bambu liefert nur einen Hex-Wert, FilaPilot zeigt einen Namen.
// Der Name ist der naechste Eintrag im Lab-Farbraum (wahrnehmungsnah) und laesst sich nach dem Import jederzeit aendern.
// Im RGB-Raum wurde z.B. ein helles Gruen (#61C680) dem Grau statt dem Gruen zugeordnet, weil dort Farbigkeit kaum zaehlt.
const COLOR_NAMES: { name: string; hex: string }[] = [
  { name: "Schwarz", hex: "#1A1A1A" },
  { name: "Weiß", hex: "#F5F5F0" },
  { name: "Dunkelgrau", hex: "#4D4D4D" },
  { name: "Grau", hex: "#8C8C88" },
  { name: "Hellgrau", hex: "#C8C8C4" },
  { name: "Silber", hex: "#B8B8B8" },
  { name: "Rot", hex: "#D14343" },
  { name: "Orange", hex: "#E8622C" },
  { name: "Gelb", hex: "#F2C94C" },
  { name: "Gold", hex: "#C9A227" },
  { name: "Hellgrün", hex: "#7ED08A" },
  { name: "Grün", hex: "#4C8C3C" },
  { name: "Dunkelgrün", hex: "#33503B" },
  { name: "Türkis", hex: "#00B1B7" },
  { name: "Hellblau", hex: "#56B7E6" },
  { name: "Blau", hex: "#2F6FED" },
  { name: "Dunkelblau", hex: "#042F56" },
  { name: "Violett", hex: "#7F56D9" },
  { name: "Magenta", hex: "#EC008C" },
  { name: "Rosa", hex: "#E38BB3" },
  { name: "Dunkelrot", hex: "#9D2235" },
  { name: "Braun", hex: "#7A5230" },
  { name: "Beige", hex: "#D8C3A0" },
  // Zusaetzliche Stuetzpunkte fuer kraeftige Varianten desselben Namens (im Lab-Raum liegen reine Grundfarben weit von
  // den gedaempften Hauptwerten oben entfernt und wuerden sonst einem Nachbarn zugeordnet, z.B. #FF0000 -> Orange).
  { name: "Rot", hex: "#FF0000" },
  { name: "Rot", hex: "#C12E1F" },
  { name: "Gelb", hex: "#FFFF00" },
  { name: "Grün", hex: "#00AE42" },
  { name: "Blau", hex: "#0000FF" },
  { name: "Blau", hex: "#0056B8" },
  { name: "Violett", hex: "#800080" }
];

const HEX_DIGITS = /^[0-9a-fA-F]+$/;

// "#RRGGBBAA" oder "#RRGGBB" -> "#RRGGBB" (gross), sonst null
export function normalizeHexColor(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  const digits = text.startsWith("#") ? text.slice(1) : "";
  if ((digits.length !== 6 && digits.length !== 8) || !HEX_DIGITS.test(digits)) {
    return null;
  }
  return `#${digits.slice(0, 6).toUpperCase()}`;
}

function channels(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// Quadrierter euklidischer Abstand zweier "#RRGGBB"-Farben im RGB-Raum (kein sqrt noetig, nur zum Vergleichen
// gegen einen Schwellwert). Erwartet bereits normalisierte Hex-Werte (siehe normalizeHexColor).
export function colorDistanceSquared(hexA: string, hexB: string): number {
  const [ar, ag, ab] = channels(hexA);
  const [br, bg, bb] = channels(hexB);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2;
}

// sRGB (#RRGGBB) -> CIELAB (D65), damit "aehnlich" dem Farbeindruck entspricht (RGB-Abstaende ueberbewerten Helligkeit).
function toLab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// Die alte Namensliste und Zuordnung (bis 0.26.0, naechster Eintrag im RGB-Raum). Nur noch fuer die einmalige Korrektur
// aelterer Importe: eine Spule gilt als "vom Import benannt", wenn ihr Name genau diesem alten Ergebnis entspricht -
// von Hand geaenderte Namen werden so nie angefasst.
const LEGACY_COLOR_NAMES: { name: string; hex: string }[] = [
  { name: "Schwarz", hex: "#1A1A1A" },
  { name: "Weiß", hex: "#F5F5F0" },
  { name: "Grau", hex: "#8C8C88" },
  { name: "Silber", hex: "#B8B8B8" },
  { name: "Rot", hex: "#D14343" },
  { name: "Orange", hex: "#E8622C" },
  { name: "Gelb", hex: "#F2C94C" },
  { name: "Gold", hex: "#C9A227" },
  { name: "Grün", hex: "#4C8C3C" },
  { name: "Türkis", hex: "#00B1B7" },
  { name: "Blau", hex: "#2F6FED" },
  { name: "Dunkelblau", hex: "#042F56" },
  { name: "Violett", hex: "#7F56D9" },
  { name: "Rosa", hex: "#E38BB3" },
  { name: "Braun", hex: "#7A5230" },
  { name: "Beige", hex: "#D8C3A0" }
];

export function legacyNearestColorName(hex: string | null): string {
  if (!hex) {
    return "Unbekannt";
  }
  const [r, g, b] = channels(hex);
  let best = "Unbekannt";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of LEGACY_COLOR_NAMES) {
    const [er, eg, eb] = channels(entry.hex);
    const distance = (r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry.name;
    }
  }
  return best;
}

// Farbname fuer importierte Spulen: der Name des Herstellers, wenn der Hex-Wert GENAU einer seiner bekannten Farben fuer
// dieses Material entspricht (z.B. Bambu Lab PLA Basic #00AE42 = "Bambu-Grün"), sonst der naechste allgemeine Name.
export function importColorName(colorHex: string | null, vendor: string, materialName: string): string {
  const exact = colorHex ? getColorPresets(vendor, materialName).find((preset) => preset.hex.toUpperCase() === colorHex) : undefined;
  return exact?.name ?? nearestColorName(colorHex);
}

export function nearestColorName(hex: string | null): string {
  if (!hex) {
    return "Unbekannt";
  }
  const [l, a, b] = toLab(hex);
  let best = COLOR_NAMES[0]?.name ?? "Unbekannt";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of COLOR_NAMES) {
    const [el, ea, eb] = toLab(entry.hex);
    const distance = (l - el) ** 2 + (a - ea) ** 2 + (b - eb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry.name;
    }
  }
  return best;
}
