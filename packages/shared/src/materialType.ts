// Grobe Zuordnung eines Produktnamens zu seinem Material-Typ ("PolyLite PLA", "PLA Silk" und "PLA+" -> "PLA"),
// damit die Statistik gleiche Grundmaterialien zusammenfasst. Faserverstaerkte Varianten (CF) und PETG zaehlen
// bewusst als eigener Typ, weil sie sich beim Drucken anders verhalten. Was nicht erkannt wird, bleibt
// unter seinem eigenen Namen stehen - es wird nichts geraten.
const MATERIAL_TYPE_RULES: { type: string; pattern: RegExp }[] = [
  { type: "PETG-CF", pattern: /\bPETG[- ]?CF\b/i },
  { type: "PETG", pattern: /\bPETG\b/i },
  { type: "PLA-CF", pattern: /\bPLA[- ]?CF\b/i },
  { type: "PLA", pattern: /\bPLA\b/i },
  { type: "ABS", pattern: /\bABS\b/i },
  { type: "ASA", pattern: /\bASA\b/i },
  { type: "HIPS", pattern: /\bHIPS\b/i },
  { type: "PA-CF", pattern: /\b(PA6?|PAHT)[- ]?CF\b/i },
  { type: "PA (Nylon)", pattern: /\b(PA\d*|Nylon)\b/i },
  { type: "PC", pattern: /\bPC\b/i },
  { type: "PVA", pattern: /\bPVA\b/i },
  { type: "TPU", pattern: /\bTPU/i }
];

export function materialTypeOf(materialName: string): string {
  const name = materialName.trim();
  return MATERIAL_TYPE_RULES.find((rule) => rule.pattern.test(name))?.type ?? name;
}
