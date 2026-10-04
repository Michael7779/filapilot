// Generische Farb-Vorauswahl ohne Hersteller-/Material-Bezug (Fallback, wenn nichts Spezifischeres hinterlegt ist).
export interface ColorPreset {
  name: string;
  hex: string;
}

export const DEFAULT_COLOR_PRESETS: ColorPreset[] = [
  { name: "Schwarz", hex: "#1A1A1A" },
  { name: "Weiß", hex: "#F5F5F0" },
  { name: "Grau", hex: "#8C8C88" },
  { name: "Rot", hex: "#D14343" },
  { name: "Orange", hex: "#E8622C" },
  { name: "Gelb", hex: "#F2C94C" },
  { name: "Grün", hex: "#4C8C3C" },
  { name: "Blau", hex: "#2F6FED" },
  { name: "Violett", hex: "#7F56D9" }
];

// Hersteller nennen dieselbe Farbe je nach Material-Linie unterschiedlich (z.B. Bambu Lab "Jade-Weiß" bei
// PLA Basic statt schlicht "Weiß"). Manuell gepflegte Momentaufnahme (Stand 2026-09) der bekanntesten Farben
// je Hersteller+Material - kein automatischer Abgleich mit Hersteller-Shops (fragil, keine offizielle API,
// siehe docs/requirements/materials.md OP). Bei Sortiments-/Namensaenderungen hier von Hand nachtragen.
// Schluessel exakt wie Manufacturer.name + "::" + Material.name in catalogData.ts.
const MANUFACTURER_COLOR_PRESETS: Record<string, ColorPreset[]> = {
  "Bambu Lab::PLA Basic": [
    { name: "Jade-Weiß", hex: "#F7F7F2" },
    { name: "Bambu-Grün", hex: "#00AE42" },
    { name: "Mistelgrün", hex: "#3F8E43" },
    { name: "Türkis", hex: "#00B1B7" },
    { name: "Kobaltblau", hex: "#0056B8" },
    { name: "Blaugrau", hex: "#5B6579" },
    { name: "Indigo-Violett", hex: "#482960" },
    { name: "Magenta", hex: "#EC008C" },
    { name: "Pink", hex: "#F55A74" },
    { name: "Rot", hex: "#C12E1F" },
    { name: "Kastanienrot", hex: "#9D2235" },
    { name: "Orange", hex: "#FF6A13" },
    { name: "Gelb", hex: "#F4EE2A" },
    { name: "Sonnenblumengelb", hex: "#FEC600" },
    { name: "Gold", hex: "#D4B36A" },
    { name: "Bronze", hex: "#847D48" },
    { name: "Braun", hex: "#7D6556" },
    { name: "Kakaobraun", hex: "#6B3A2D" },
    { name: "Grau", hex: "#8E9089" },
    { name: "Silber", hex: "#A6A9AA" },
    { name: "Schwarz", hex: "#000000" }
  ],
  // PETG Basic / PETG Translucent: Namen wie im Bambu-Lab-EU-Shop (Stand 2026-10-04), Hex-Werte aus den Farbmustern
  // dort gemessen (Mittelwert der Bildmitte) - Naeherung, kein offizieller Farbcode.
  "Bambu Lab::PETG Basic": [
    { name: "Schwarz", hex: "#000000" },
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Grau", hex: "#7F7E83" },
    { name: "Rot", hex: "#D6001C" },
    { name: "Orange", hex: "#FF671E" },
    { name: "Gelb", hex: "#FCE300" },
    { name: "Grün", hex: "#01963A" },
    { name: "Pinien-Grün", hex: "#034537" },
    { name: "Marineblau", hex: "#0185D7" },
    { name: "Reflex Blue", hex: "#001389" },
    { name: "Misty Blue", hex: "#688197" },
    { name: "Dunkelbeige", hex: "#DBC8B7" },
    { name: "Dunkelbraun", hex: "#502C1E" }
  ],
  "Bambu Lab::PETG Translucent": [
    { name: "Klar", hex: "#E0E0E0" },
    { name: "Grau", hex: "#8E8E8E" },
    { name: "Blaugrün", hex: "#77EDD7" },
    { name: "Lichtblau", hex: "#61B0FF" },
    { name: "Violett", hex: "#D6ABFF" },
    { name: "Pink", hex: "#F9C1BD" },
    { name: "Orange", hex: "#FF911A" },
    { name: "Braun", hex: "#E5C688" },
    { name: "Oliv", hex: "#748C45" }
  ],
  "Bambu Lab::PLA Matte": [
    { name: "Matte Ivory-Weiß", hex: "#EDE8DA" },
    { name: "Matte Bone-Weiß", hex: "#CBC6B8" },
    { name: "Matte Charcoal", hex: "#4D4D4D" },
    { name: "Matte Dunkelgrün", hex: "#33503B" },
    { name: "Matte Apfelgrün", hex: "#6C9E43" },
    { name: "Matte Himmelblau", hex: "#5CA7D3" },
    { name: "Matte Ozeanblau", hex: "#1C6FB2" },
    { name: "Matte Purpur", hex: "#5A3E85" },
    { name: "Matte Magenta", hex: "#C13478" },
    { name: "Matte Pflaume", hex: "#7D3049" },
    { name: "Matte Granatapfel", hex: "#9A2235" },
    { name: "Matte Orange", hex: "#E0762D" },
    { name: "Matte Gelb", hex: "#F0C34E" },
    { name: "Matte Karamell", hex: "#B08055" },
    { name: "Matte Latte", hex: "#C9A987" },
    { name: "Matte Schwarz", hex: "#231F20" }
  ],
  "Bambu Lab::PLA Silk": [
    { name: "Silk Gold", hex: "#D9B96A" },
    { name: "Silk Silber", hex: "#C6C8C8" },
    { name: "Silk Titan-Gold", hex: "#9C7F4E" },
    { name: "Silk Mint", hex: "#77C9A4" },
    { name: "Silk Pink", hex: "#E893B2" },
    { name: "Silk Purpur", hex: "#7A4FA3" },
    { name: "Silk Blau", hex: "#1E6FC4" },
    { name: "Silk Candy-Grün", hex: "#3FAE4A" },
    { name: "Silk Rosegold", hex: "#D69C93" },
    { name: "Silk Weiß", hex: "#EFEDE6" }
  ],
  "Bambu Lab::PETG HF": [
    { name: "Weiß", hex: "#F3F3EF" },
    { name: "Schwarz", hex: "#17171A" },
    { name: "Grau", hex: "#898D8E" },
    { name: "Blau", hex: "#1B5FBF" },
    { name: "Grün", hex: "#2E8B45" },
    { name: "Orange", hex: "#E8622C" },
    { name: "Rot", hex: "#C0392B" },
    { name: "Violett", hex: "#6A4C93" },
    { name: "Bernstein", hex: "#C58B3D" }
  ],
  "Bambu Lab::ABS": [
    { name: "Weiß", hex: "#F2F2EE" },
    { name: "Schwarz", hex: "#1A1A1A" },
    { name: "Grau", hex: "#8A8D8E" },
    { name: "Rot", hex: "#C0392B" },
    { name: "Blau", hex: "#1B5FBF" },
    { name: "Grün", hex: "#3F8E43" },
    { name: "Gelb", hex: "#F2C94C" },
    { name: "Orange", hex: "#E8622C" }
  ],
  "Bambu Lab::ASA": [
    { name: "Weiß", hex: "#F2F2EE" },
    { name: "Schwarz", hex: "#1A1A1A" },
    { name: "Grau", hex: "#8A8D8E" },
    { name: "Natur", hex: "#E7D9BD" }
  ]
};

// Exakte Hersteller+Material-Kombination bevorzugt, sonst die generische Liste - nie eine lange
// Gesamtliste ueber alle Materialien eines Herstellers hinweg anzeigen.
export function getColorPresets(manufacturerName: string | null, materialName: string | null): ColorPreset[] {
  if (manufacturerName && materialName) {
    const specific = MANUFACTURER_COLOR_PRESETS[`${manufacturerName}::${materialName}`];
    if (specific) {
      return specific;
    }
  }
  return DEFAULT_COLOR_PRESETS;
}
