// Feste Liste deutscher Farbnamen fuer den Import: Bambu liefert nur einen Hex-Wert, FilaPilot zeigt einen Namen.
// Der Name ist der nachste Eintrag im RGB-Raum und laesst sich nach dem Import jederzeit aendern.
const COLOR_NAMES: { name: string; hex: string }[] = [
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

export function nearestColorName(hex: string | null): string {
  if (!hex) {
    return "Unbekannt";
  }
  const [r, g, b] = channels(hex);
  let best = COLOR_NAMES[0]?.name ?? "Unbekannt";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of COLOR_NAMES) {
    const [er, eg, eb] = channels(entry.hex);
    const distance = (r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry.name;
    }
  }
  return best;
}
