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
// PLA Basic statt schlicht "Weiß"). Manuell gepflegte Momentaufnahme der Farben je Hersteller+Material - kein automatischer
// Abgleich mit Hersteller-Shops (fragil, keine offizielle API, siehe docs/requirements/materials.md OP). Bei
// Sortiments-/Namensaenderungen hier von Hand nachtragen.
// Bambu Lab: Namen und Farben aus dem Bambu-Lab-EU-Shop (deutsche Seite, eu.store.bambulab.com/de), Stand 2026-10-17, alle
// Filament-Produkte mit allen dort gelisteten Farben (ohne Bundles). Die Hex-Werte sind der Mittelwert der Mitte des Farbmusters
// im Shop - eine Naeherung, kein offizieller Farbcode; bei mehrfarbigen Linien (Gradient, Multi-Color, Galaxy) die Hauptfarbe.
// Durchsichtige Muster (z.B. "Transparent") haben das neutrale Hellgrau #E0E0E0.
// Schluessel exakt wie Manufacturer.name + "::" + Material.name in catalogData.ts.
const MANUFACTURER_COLOR_PRESETS: Record<string, ColorPreset[]> = {
  "Bambu Lab::ABS": [
    { name: "Silber", hex: "#87909A" },
    { name: "Schwarz", hex: "#000000" },
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Rot", hex: "#D32941" },
    { name: "Bambu Green", hex: "#00AE42" },
    { name: "Orange", hex: "#FF6A13" },
    { name: "Marineblau", hex: "#0C2340" },
    { name: "Mandaringelb", hex: "#FFC72C" },
    { name: "Blau", hex: "#0A2CA5" },
    { name: "Olive", hex: "#789D4A" },
    { name: "Azure", hex: "#489FDF" }
  ],
  "Bambu Lab::ABS-GF": [
    { name: "Orange", hex: "#F48438" },
    { name: "Rot", hex: "#E83100" },
    { name: "Blau", hex: "#0C3B95" },
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Grau", hex: "#C6C6C6" },
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::ASA": [
    { name: "Grün", hex: "#00A6A0" },
    { name: "Rot", hex: "#E02928" },
    { name: "Blau", hex: "#2140B4" },
    { name: "Weiß", hex: "#FFFAF2" },
    { name: "Grau", hex: "#8A949E" },
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::ASA Aero": [
    { name: "Weiß", hex: "#F5F1DD" }
  ],
  "Bambu Lab::ASA-CF": [
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PA6-CF": [
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PA6-GF": [
    { name: "Blau", hex: "#75AED8" },
    { name: "Orange", hex: "#FF4800" },
    { name: "Gelb", hex: "#FFCE00" },
    { name: "Limette", hex: "#C5ED48" },
    { name: "Braun", hex: "#5B492F" },
    { name: "Weiß", hex: "#EAEAE4" },
    { name: "Grau", hex: "#353533" },
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PAHT-CF": [
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PC": [
    { name: "Durchsichtig", hex: "#FFFFFF" },
    { name: "Klares Schwarz", hex: "#5A5161" },
    { name: "Schwarz", hex: "#000000" },
    { name: "Weiß", hex: "#FFFFFF" }
  ],
  "Bambu Lab::PC FR": [
    { name: "Schwarz", hex: "#000000" },
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Grau", hex: "#A8A8AA" }
  ],
  "Bambu Lab::PET-CF": [
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PETG Basic": [
    { name: "Orange", hex: "#FF671E" },
    { name: "Rot", hex: "#D6001C" },
    { name: "Gelb", hex: "#FCE300" },
    { name: "Grün", hex: "#01963A" },
    { name: "Marineblau", hex: "#0185D7" },
    { name: "Reflex Blue", hex: "#001389" },
    { name: "Dunkelbeige", hex: "#DBC8B7" },
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Schwarz", hex: "#000000" },
    { name: "Dunkelbraun", hex: "#502C1E" },
    { name: "Grau", hex: "#7F7E83" },
    { name: "Misty Blue", hex: "#688197" },
    { name: "Pinien-Grün", hex: "#034537" },
    // "Natur": kein Farbmuster im Shop - Schaetzwert (naturfarbenes, leicht cremiges PETG), fuer aeltere Spulen
    { name: "Natur", hex: "#EBE6D8" }
  ],
  "Bambu Lab::PETG HF": [
    { name: "Schwarz", hex: "#000000" },
    { name: "Grau", hex: "#ADB1B2" },
    { name: "Dunkelgrau", hex: "#515151" },
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Blau", hex: "#002E96" },
    { name: "Seeblau", hex: "#1F79E5" },
    { name: "Rot", hex: "#EB3A3A" },
    { name: "Gelb", hex: "#FFD00B" },
    { name: "Orange", hex: "#F75403" },
    { name: "Erdnussbraun", hex: "#875718" },
    { name: "Limettengrün", hex: "#6EE53C" },
    { name: "Grün", hex: "#00AE42" },
    { name: "Waldgrün", hex: "#39541A" },
    { name: "Creme", hex: "#F9DFB9" }
  ],
  "Bambu Lab::PETG Matte": [
    { name: "Black", hex: "#000000" },
    { name: "White", hex: "#FFFFFF" },
    { name: "Gray", hex: "#7F7E83" },
    { name: "Pink", hex: "#FABBCB" },
    { name: "Violet", hex: "#A7A4E0" },
    { name: "Baby Blue", hex: "#B9D9EB" },
    { name: "Avocado Green", hex: "#BCE194" },
    { name: "Lime", hex: "#C0DF16" }
  ],
  "Bambu Lab::PETG Translucent": [
    { name: "Blaugrün", hex: "#77EDD7" },
    { name: "Lichtblau", hex: "#61B0FF" },
    { name: "Transparent", hex: "#E0E0E0" },
    { name: "Pink", hex: "#F9C1BD" },
    { name: "Oliv", hex: "#748C45" },
    { name: "Orange", hex: "#FF911A" },
    { name: "Violett", hex: "#D6ABFF" },
    { name: "Braun", hex: "#E5C688" },
    { name: "Grau", hex: "#8E8E8E" }
  ],
  "Bambu Lab::PETG-CF": [
    { name: "Lila-Violett", hex: "#583061" },
    { name: "Malachitgrün", hex: "#16B08E" },
    { name: "Indigo-Blau", hex: "#324585" },
    { name: "Schwarz", hex: "#000000" },
    { name: "Titangrau", hex: "#565656" },
    { name: "Ziegelrot", hex: "#9F332A" }
  ],
  "Bambu Lab::PLA Aero": [
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Grau", hex: "#CDCECA" }
  ],
  "Bambu Lab::PLA Basic": [
    { name: "Jade-Weiß", hex: "#FFFFFF" },
    { name: "Beige", hex: "#F7E6DE" },
    { name: "Hellgrau", hex: "#D1D3D5" },
    { name: "Gelb", hex: "#F4EE2A" },
    { name: "Sonnenblumen-Gelb", hex: "#FEC601" },
    { name: "Gold", hex: "#E4BD68" },
    { name: "Kürbis-Orange", hex: "#FF8E16" },
    { name: "Orange", hex: "#FF6A13" },
    { name: "Hellgrün", hex: "#BDCF00" },
    { name: "Bambusgrün", hex: "#16C344" },
    { name: "Mistelzweig-Grün", hex: "#3F8E43" },
    { name: "Pink", hex: "#F55A74" },
    { name: "Heißes Pink", hex: "#F5547D" },
    { name: "Magenta", hex: "#EC008C" },
    { name: "Rot", hex: "#C12E1F" },
    { name: "Kastanienrot", hex: "#9D2236" },
    { name: "Lila", hex: "#5E43B7" },
    { name: "Indigo-Violett", hex: "#482A60" },
    { name: "Türkis", hex: "#00B1B7" },
    { name: "Cyan", hex: "#0086D6" },
    { name: "Kobaltblau", hex: "#0055B8" },
    { name: "Blau", hex: "#0A2989" },
    { name: "Braun", hex: "#9D432C" },
    { name: "Kakaobraun", hex: "#6F5034" },
    { name: "Bronze", hex: "#847D48" },
    { name: "Grau", hex: "#8E9089" },
    { name: "Silber", hex: "#A6A9AA" },
    { name: "Blaugrau", hex: "#5B6579" },
    { name: "Dunkelgrau", hex: "#545454" },
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PLA Basic Gradient": [
    { name: "Zuckerwatten-Wolke", hex: "#D9DCEB" },
    { name: "Blaubeere-Bubblegum", hex: "#A9C5F0" },
    { name: "Zitrus-Pink", hex: "#F3A19B" },
    { name: "Minze-Limette", hex: "#A0EA6D" },
    { name: "Leuchtende Abenddämmerung", hex: "#E68F60" },
    { name: "Meer und Wiese", hex: "#71CFCF" },
    { name: "Arktisches Flüstern", hex: "#E0F6F6" },
    { name: "Sonnenbrise", hex: "#F8BCB6" }
  ],
  "Bambu Lab::PLA Galaxy": [
    { name: "Lila", hex: "#594177" },
    { name: "Grün", hex: "#3B665E" },
    { name: "Nebel", hex: "#424379" },
    { name: "Braun", hex: "#684A43" }
  ],
  "Bambu Lab::PLA Glow": [
    { name: "Leuchtend-Orange", hex: "#FF9D5B" },
    { name: "Leuchtend-Gelb", hex: "#F8FF80" },
    { name: "Leuchtend-Grün", hex: "#A1FFAC" },
    { name: "Leuchtend-Pink", hex: "#F17B8F" },
    { name: "Leuchtend-Blau", hex: "#7AC0E9" }
  ],
  "Bambu Lab::PLA Marble": [
    { name: "Granitrot", hex: "#AD4E38" },
    { name: "Weißer Marmor", hex: "#F7F3F0" }
  ],
  "Bambu Lab::PLA Matte": [
    { name: "Elfenbeinweiß", hex: "#FFFFFF" },
    { name: "Knochenweiß", hex: "#CBC6B8" },
    { name: "Zitronengelb", hex: "#F7D959" },
    { name: "Mandarinorange", hex: "#F99963" },
    { name: "Sakura-Rosa", hex: "#E8AFCF" },
    { name: "Fliederlila", hex: "#AE96D4" },
    { name: "Pflaume", hex: "#950051" },
    { name: "Scharlachrot", hex: "#DE4343" },
    { name: "Dunkelrot", hex: "#BB3D43" },
    { name: "Apfelgrün", hex: "#C2E189" },
    { name: "Grasgrün", hex: "#61C680" },
    { name: "Dunkelgrün", hex: "#68724D" },
    { name: "Eisblau", hex: "#A3D8E1" },
    { name: "Himmelblau", hex: "#56B7E6" },
    { name: "Marineblau", hex: "#0078BF" },
    { name: "Dunkelblau", hex: "#042F56" },
    { name: "Wüstengelb", hex: "#E8DBB7" },
    { name: "Latte-Braun", hex: "#D3B7A7" },
    { name: "Karamell", hex: "#AE835B" },
    { name: "Terrakotta", hex: "#B15533" },
    { name: "Dunkelbraun", hex: "#7D6556" },
    { name: "Dunkle Schokolade", hex: "#4D3324" },
    { name: "Aschgrau", hex: "#9B9EA0" },
    { name: "Nardo-Grau", hex: "#757575" },
    { name: "Anthrazit", hex: "#000000" }
  ],
  "Bambu Lab::PLA Metal": [
    { name: "Metallisches Kobaltblau", hex: "#39699E" },
    { name: "Metallisches Oxidgrün", hex: "#1D7C6A" },
    { name: "Iridium-Goldmetall", hex: "#B39B84" },
    { name: "Metallisches Kupferbraun", hex: "#AA6443" },
    { name: "Eisen-Metallgrau", hex: "#43403D" }
  ],
  "Bambu Lab::PLA Pure": [
    { name: "Milchrosa", hex: "#F7CDD7" },
    { name: "Babyblau", hex: "#A5DAE8" },
    { name: "Aprikose", hex: "#FFB672" },
    { name: "Reinweiß", hex: "#FFFFFF" },
    { name: "Absolutes Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PLA Silk Multi-Color": [
    { name: "Mystic Magenta", hex: "#594252" },
    { name: "Phantomblau", hex: "#003555" },
    { name: "Dunkler Samt", hex: "#592524" },
    { name: "Neon City", hex: "#6633AE" },
    { name: "Mitternachtsglanz", hex: "#442F7D" },
    { name: "Goldenes Rosa", hex: "#FF9425" },
    { name: "Hawaii-Blau", hex: "#56C7C1" },
    { name: "Morgenglanz", hex: "#8C9DBB" },
    { name: "Aurora-Lila", hex: "#4450AE" },
    { name: "Südstrand", hex: "#878098" }
  ],
  "Bambu Lab::PLA Silk+": [
    { name: "Titangrau", hex: "#5F6367" },
    { name: "Gold-Rosa", hex: "#BA9594" },
    { name: "Babyblau", hex: "#A8C6EE" },
    { name: "Champagner", hex: "#F3CFB2" },
    { name: "Minze", hex: "#96DCB9" },
    { name: "Candy-Rot", hex: "#D02727" },
    { name: "Candy-Grün", hex: "#018814" },
    { name: "Blau", hex: "#008BDA" },
    { name: "Lila", hex: "#8671CB" },
    { name: "Pink", hex: "#F7ADA6" },
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Silber", hex: "#C8C8C8" },
    { name: "Gold", hex: "#F4A925" }
  ],
  "Bambu Lab::PLA Sparkle": [
    { name: "Glitzerndes Alpengrün", hex: "#3F5443" },
    { name: "Glitzerndes Schiefergrau", hex: "#8E9089" },
    { name: "Glitzerndes Königslila", hex: "#483D8B" },
    { name: "Glitzerndes Karminrot", hex: "#792B36" },
    { name: "Glitzerndes Onyx-Schwarz", hex: "#2D2B28" },
    { name: "Klassisches Glitzer-Gold", hex: "#CEA629" }
  ],
  "Bambu Lab::PLA Tough+": [
    { name: "Gelb", hex: "#F4D53F" },
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Orange", hex: "#DC3926" },
    { name: "Grau", hex: "#AFB1AE" },
    { name: "Silber", hex: "#959698" },
    { name: "Cyan", hex: "#019BD9" },
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PLA Translucent": [
    { name: "Türkis", hex: "#009FA1" },
    { name: "Blau", hex: "#0047BB" },
    { name: "Lila", hex: "#8344B0" },
    { name: "Orange", hex: "#F74E02" },
    { name: "Rot", hex: "#B50011" },
    { name: "Helles Jade", hex: "#96D8AF" },
    { name: "Zartgelb", hex: "#F5DBAB" },
    { name: "Kirschrosa", hex: "#F5B6CD" },
    { name: "Eisblau", hex: "#B8CDE9" },
    { name: "Lavendel", hex: "#B8ACD6" }
  ],
  "Bambu Lab::PLA Wood": [
    { name: "Klassische Birke", hex: "#918669" },
    { name: "Schwarze Walnuss", hex: "#4F3F24" },
    { name: "Rosenholz", hex: "#4C241C" },
    { name: "Lehmbraun", hex: "#995F11" },
    { name: "Weiße Eiche", hex: "#D6CCA3" },
    { name: "Ockergelb", hex: "#C98935" }
  ],
  "Bambu Lab::PLA-CF": [
    { name: "Matcha-Grün", hex: "#5C9748" },
    { name: "Burgunderrot", hex: "#951E23" },
    { name: "Jeansblau", hex: "#6E88BC" },
    { name: "Lava-Grau", hex: "#4D5054" },
    { name: "Schwarz", hex: "#000000" },
    { name: "Königsblau", hex: "#2842AD" },
    { name: "Iris-Violett", hex: "#69398E" }
  ],
  "Bambu Lab::PPA-CF": [
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PPS-CF": [
    { name: "Schwarz", hex: "#000000" }
  ],
  "Bambu Lab::PVA": [
    { name: "Klar", hex: "#F0F1A8" }
  ],
  "Bambu Lab::Support for ABS": [
    { name: "Weiß", hex: "#FFFFFF" }
  ],
  "Bambu Lab::Support for PA/PET": [
    { name: "Grün", hex: "#C0DF16" }
  ],
  "Bambu Lab::Support for PLA": [
    { name: "Weiß", hex: "#FFFFFF" }
  ],
  "Bambu Lab::Support for PLA/PETG": [
    { name: "Schwarz", hex: "#000000" },
    { name: "Natur", hex: "#FFFFFF" }
  ],
  "Bambu Lab::TPU 85A": [
    { name: "Schwarz", hex: "#000000" },
    { name: "Licht Cyan", hex: "#B9E3DF" },
    { name: "Neonorange", hex: "#F68A1B" },
    { name: "Rosébeige/Hautfarben", hex: "#F3CFB2" },
    { name: "Limonengrün", hex: "#CDEA80" }
  ],
  "Bambu Lab::TPU 90A": [
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Schwarz", hex: "#000000" },
    { name: "Kakaobraun", hex: "#5C4738" },
    { name: "Quicksilver", hex: "#9EA2A3" },
    { name: "Eingefroren", hex: "#B4E3F6" },
    { name: "Blaze", hex: "#EB949F" },
    { name: "Traubengelee", hex: "#D6ABFF" },
    { name: "Crystal Blue", hex: "#7EB4E1" }
  ],
  "Bambu Lab::TPU 95A HF": [
    { name: "Weiß", hex: "#FFFFFF" },
    { name: "Grau", hex: "#898D8D" },
    { name: "Gelb", hex: "#F3E600" },
    { name: "Blau", hex: "#0072CE" },
    { name: "Rot", hex: "#C8102E" },
    { name: "Schwarz", hex: "#101820" }
  ],
  "Bambu Lab::TPU for AMS": [
    { name: "Blau", hex: "#5898DD" },
    { name: "Grau", hex: "#939393" },
    { name: "Schwarz", hex: "#000000" },
    { name: "Gelb", hex: "#F9EF41" },
    { name: "Rot", hex: "#ED0000" },
    { name: "Neongrün", hex: "#90FF1A" },
    { name: "Weiß", hex: "#FFFFFF" }
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

export interface CatalogSelection {
  manufacturerName: string | null;
  materialName: string | null;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Wechselt jemand Hersteller oder Material, darf eine aus der Voreinstellung gewaehlte Farbe nicht stehen bleiben, wenn
// das neue Material sie gar nicht anbietet (sonst steht z.B. "Grau" bei PLA Matte, wo es nur "Matte Charcoal" gibt).
// Zurueckgesetzt (null) wird nur eine Farbe, die genau so (Name UND Farbwert) in der Liste der bisherigen Auswahl stand;
// eine von Hand eingetragene oder angepasste Farbe bleibt. So geht beim Umschalten nichts verloren, was man selbst getippt hat.
export function colorAfterCatalogChange<T extends { name: string; hex: string }>(
  color: T,
  previous: CatalogSelection,
  next: CatalogSelection
): T | null {
  if (color.name.trim() === "") {
    return color;
  }
  const fromPreviousPreset = getColorPresets(previous.manufacturerName, previous.materialName).some(
    (preset) => sameName(preset.name, color.name) && sameName(preset.hex, color.hex)
  );
  if (!fromPreviousPreset) {
    return color;
  }
  const stillOffered = getColorPresets(next.manufacturerName, next.materialName).some((preset) => sameName(preset.name, color.name));
  return stillOffered ? color : null;
}
