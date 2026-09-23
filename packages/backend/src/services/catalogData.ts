// Mitgelieferte Hersteller und Materialien mit Richttemperaturen (Duese min/max, Druckbett).
// Das sind typische Herstellerempfehlungen, keine garantierten Werte - im Zweifel gilt das
// Datenblatt auf der Spule. Admins koennen alles unter Einstellungen -> Stammdaten aendern.
// Bei jeder inhaltlichen Aenderung CATALOG_VERSION erhoehen, dann werden fehlende Eintraege
// beim naechsten Zugriff nachgetragen (bestehende und geloeschte bleiben unberuehrt).
export const CATALOG_VERSION = 1;

export interface CatalogMaterial {
  manufacturer: string | null;
  name: string;
  minC: number;
  maxC: number;
  bedC: number | null;
}

export const CATALOG_MANUFACTURERS = [
  "3DJake",
  "Bambu Lab",
  "ColorFabb",
  "Devil Design",
  "eSun",
  "Extrudr",
  "Fillamentum",
  "Hatchbox",
  "Overture",
  "Polymaker",
  "Prusament",
  "Sunlu"
] as const;

const m = (
  manufacturer: string | null,
  name: string,
  minC: number,
  maxC: number,
  bedC: number | null
): CatalogMaterial => ({ manufacturer, name, minC, maxC, bedC });

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

  m("Bambu Lab", "ABS", 240, 270, 90),
  m("Bambu Lab", "ASA", 240, 270, 90),
  m("Bambu Lab", "PA6-CF", 260, 290, 100),
  m("Bambu Lab", "PAHT-CF", 260, 290, 100),
  m("Bambu Lab", "PC", 260, 290, 110),
  m("Bambu Lab", "PETG HF", 230, 260, 70),
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
  m("3DJake", "PLA", 190, 220, 60)
];
