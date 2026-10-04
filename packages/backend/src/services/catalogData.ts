// Mitgelieferte Hersteller und Materialien mit Richttemperaturen (Duese min/max, Druckbett) und
// typischer Dichte (g/cm³, fuer die ungefaehre Restlaengen-Anzeige). Das sind typische Herstellerangaben,
// keine garantierten Werte - im Zweifel gilt das Datenblatt auf der Spule. Admins koennen alles unter
// Einstellungen -> Stammdaten aendern. Bei jeder inhaltlichen Aenderung CATALOG_VERSION erhoehen, dann
// werden fehlende Eintraege beim naechsten Zugriff nachgetragen (bestehende und geloeschte bleiben unberuehrt).
export const CATALOG_VERSION = 4;

export interface CatalogMaterial {
  manufacturer: string | null;
  name: string;
  minC: number;
  maxC: number;
  bedC: number | null;
  densityGCm3: number | null;
  // Richtpreis in Cent je Spule (Nachfuellung / mit Spule), siehe Material.priceRefillCents. null = unbekannt.
  priceRefillCents: number | null;
  priceWithSpoolCents: number | null;
}

// Dichte haengt praktisch nur von der Material-Chemie ab, nicht von der Marke - deshalb ueber den Namen erkannt statt
// pro Zeile gepflegt. Reihenfolge wichtig: spezifischere Namen (z.B. "PETG-CF") muessen vor dem allgemeinen Namen
// ("PETG") stehen, sonst gewinnt der falsche Treffer.
const DENSITY_BY_KEYWORD: [string, number][] = [
  ["PA-CF", 1.15],
  ["PA6-CF", 1.15],
  ["PAHT-CF", 1.15],
  ["PETG-CF", 1.3],
  ["PETG HF", 1.27],
  ["PETG", 1.27],
  ["PLA-CF", 1.26],
  ["PLA", 1.24],
  ["PA", 1.14],
  ["Nylon", 1.14],
  ["ASA", 1.07],
  ["ABS", 1.04],
  ["HIPS", 1.04],
  ["PC Blend", 1.19],
  ["PC", 1.2],
  ["TPU", 1.21],
  ["Filaflex", 1.21],
  ["PVA", 1.23],
  ["XT", 1.27]
];

function densityFor(name: string): number | null {
  const match = DENSITY_BY_KEYWORD.find(([keyword]) => name.includes(keyword));
  return match ? match[1] : null;
}

export const CATALOG_MANUFACTURERS = [
  "3DJake",
  "Anycubic",
  "Bambu Lab",
  "ColorFabb",
  "Creality",
  "Devil Design",
  "Elegoo",
  "eSun",
  "Extrudr",
  "Fiberlogy",
  "Fillamentum",
  "Formfutura",
  "Geeetech",
  "Hatchbox",
  "Kingroon",
  "Overture",
  "Polymaker",
  "Prusament",
  "R3D",
  "Recreus",
  "Sunlu",
  "Voxelab"
] as const;

// Bambu Lab: guenstigster Staffelpreis (ab 10 Spulen, je 1 kg) im Bambu-Lab-EU-Shop (eu.store.bambulab.com), Stand
// 2026-10-04, in Cent: [Nachfuellung ohne Spule, Filament mit Spule]. null = dort nicht einzeln erhaeltlich. PVA gibt es nur
// als 0,5-kg-Spule (Preis je Spule). Nur ein Richtwert - der Shop aendert Preise; Admins pflegen sie unter Stammdaten.
const BAMBU_LAB_PRICES: Record<string, [number | null, number | null]> = {
  ABS: [1019, 1199],
  ASA: [null, 2499],
  "PA6-CF": [null, 8299],
  "PAHT-CF": [null, 10199],
  PC: [null, 4299],
  "PETG Basic": [959, 1139],
  "PETG HF": [1019, 1199],
  "PETG Translucent": [1019, 1199],
  "PLA Basic": [1019, 1199],
  "PLA Matte": [1019, 1199],
  "PLA Silk": [1019, 1199],
  "PLA-CF": [2699, 2999],
  PVA: [null, 4199],
  "TPU 95A HF": [null, 3499]
};

const m = (
  manufacturer: string | null,
  name: string,
  minC: number,
  maxC: number,
  bedC: number | null
): CatalogMaterial => {
  const [priceRefillCents, priceWithSpoolCents] = (manufacturer === "Bambu Lab" ? BAMBU_LAB_PRICES[name] : undefined) ?? [null, null];
  return { manufacturer, name, minC, maxC, bedC, densityGCm3: densityFor(name), priceRefillCents, priceWithSpoolCents };
};

export const CATALOG_MATERIALS: CatalogMaterial[] = [
  // Allgemein (fuer jeden Hersteller waehlbar)
  m(null, "ABS", 230, 260, 100),
  m(null, "ASA", 240, 260, 100),
  m(null, "HIPS", 230, 250, 95),
  m(null, "PA (Nylon)", 250, 280, 80),
  m(null, "PA-CF", 260, 290, 90),
  m(null, "PC", 260, 290, 110),
  m(null, "PETG", 220, 250, 75),
  m(null, "PETG-CF", 240, 270, 75),
  m(null, "PLA", 190, 220, 60),
  m(null, "PLA+", 200, 230, 60),
  m(null, "PLA-CF", 210, 240, 60),
  m(null, "PLA Silk", 200, 230, 60),
  m(null, "PVA", 190, 210, 55),
  m(null, "TPU", 210, 230, 50),
  m(null, "PP", 220, 250, 100),
  m(null, "PA6-CF", 260, 290, 90),
  m(null, "PLA Wood", 190, 220, 55),
  m(null, "PLA Glow", 190, 220, 55),
  m(null, "PLA Metal", 195, 220, 60),

  m("Bambu Lab", "ABS", 240, 270, 90),
  m("Bambu Lab", "ASA", 240, 270, 90),
  m("Bambu Lab", "PA6-CF", 260, 290, 100),
  m("Bambu Lab", "PAHT-CF", 260, 290, 100),
  m("Bambu Lab", "PC", 260, 290, 110),
  m("Bambu Lab", "PETG Basic", 220, 250, 75),
  m("Bambu Lab", "PETG HF", 230, 260, 70),
  m("Bambu Lab", "PETG Translucent", 220, 250, 75),
  m("Bambu Lab", "PLA Basic", 190, 230, 45),
  m("Bambu Lab", "PLA Matte", 190, 230, 45),
  m("Bambu Lab", "PLA Silk", 190, 230, 45),
  m("Bambu Lab", "PLA-CF", 210, 240, 55),
  m("Bambu Lab", "PVA", 190, 210, 55),
  m("Bambu Lab", "TPU 95A HF", 220, 240, 35),

  m("ColorFabb", "PLA/PHA", 200, 230, 55),
  m("ColorFabb", "XT", 240, 270, 75),

  m("Devil Design", "PETG", 230, 250, 75),
  m("Devil Design", "PLA", 190, 220, 60),

  m("eSun", "ABS+", 240, 270, 100),
  m("eSun", "PETG", 230, 250, 75),
  m("eSun", "PLA+", 205, 225, 60),
  m("eSun", "TPU 95A", 210, 230, 50),

  m("Extrudr", "PETG", 220, 250, 75),
  m("Extrudr", "PLA NX2", 190, 220, 55),

  m("Fillamentum", "ASA Extrafill", 240, 260, 95),
  m("Fillamentum", "PLA Extrafill", 195, 220, 55),

  m("Hatchbox", "ABS", 210, 240, 100),
  m("Hatchbox", "PETG", 220, 250, 75),
  m("Hatchbox", "PLA", 180, 210, 60),

  m("Overture", "ABS", 240, 260, 100),
  m("Overture", "PETG", 230, 250, 75),
  m("Overture", "PLA", 190, 220, 55),
  m("Overture", "TPU", 210, 230, 50),

  m("Polymaker", "PolyFlex TPU95", 210, 230, 50),
  m("Polymaker", "PolyLite ABS", 230, 260, 100),
  m("Polymaker", "PolyLite ASA", 240, 270, 100),
  m("Polymaker", "PolyLite PETG", 230, 250, 75),
  m("Polymaker", "PolyLite PLA", 190, 230, 55),
  m("Polymaker", "PolyTerra PLA", 190, 230, 55),

  m("Prusament", "ASA", 250, 270, 105),
  m("Prusament", "PC Blend", 265, 285, 110),
  m("Prusament", "PETG", 230, 250, 85),
  m("Prusament", "PLA", 205, 225, 60),

  m("Sunlu", "ABS", 230, 260, 100),
  m("Sunlu", "PETG", 230, 250, 75),
  m("Sunlu", "PLA", 190, 220, 55),
  m("Sunlu", "PLA+", 200, 230, 60),
  m("Sunlu", "PLA Silk", 200, 230, 60),
  m("Sunlu", "TPU", 210, 230, 50),

  m("3DJake", "PETG", 230, 250, 75),
  m("3DJake", "PLA", 190, 220, 60),

  m("Anycubic", "ABS", 230, 260, 100),
  m("Anycubic", "PETG", 230, 250, 80),
  m("Anycubic", "PLA", 190, 220, 60),
  m("Anycubic", "TPU", 210, 230, 50),

  m("Creality", "ABS", 230, 260, 100),
  m("Creality", "CR-PETG", 230, 250, 80),
  m("Creality", "CR-PLA", 190, 230, 55),
  m("Creality", "Ender-PLA", 190, 220, 55),
  m("Creality", "Hyper PLA", 220, 240, 55),

  m("Elegoo", "ABS", 230, 260, 100),
  m("Elegoo", "PETG", 230, 250, 80),
  m("Elegoo", "PLA", 190, 220, 55),
  m("Elegoo", "Rapid PLA+", 210, 230, 55),

  m("Fiberlogy", "Easy PET-G", 230, 250, 80),
  m("Fiberlogy", "Easy PLA", 195, 225, 60),
  m("Fiberlogy", "Fiberflex 40D", 220, 240, 50),

  m("Formfutura", "EasyFil ABS", 235, 260, 100),
  m("Formfutura", "EasyFil PLA", 195, 220, 60),
  m("Formfutura", "HDglass (PETG)", 230, 240, 80),

  m("Geeetech", "ABS", 220, 250, 100),
  m("Geeetech", "PETG", 220, 250, 75),
  m("Geeetech", "PLA", 190, 220, 55),

  m("Kingroon", "PETG", 220, 250, 75),
  m("Kingroon", "PLA", 190, 220, 55),

  m("R3D", "PETG", 225, 245, 80),
  m("R3D", "PLA", 195, 220, 60),

  m("Recreus", "Filaflex 82A", 210, 230, 50),
  m("Recreus", "Filaflex 95A", 220, 240, 50),

  m("Voxelab", "PETG", 220, 250, 75),
  m("Voxelab", "PLA", 190, 220, 55)
];
