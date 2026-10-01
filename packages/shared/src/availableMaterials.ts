export interface MaterialLike {
  manufacturerId: string | null;
}

// Materialien fuer das Spulen-Formular bei gewaehltem Hersteller: zeigt dessen eigene Produkte (z.B. Bambu Lab
// "PLA Basic", "PLA Matte", ...), wenn er welche hat. Generische Materialien (kein Hersteller) erscheinen als
// Fallback, wenn (noch) kein Hersteller feststeht (nichts gewaehlt, oder "+ Neuer Hersteller" gerade erst im
// Entstehen) oder der gewaehlte Hersteller selbst noch kein eigenes Material hat - sonst wuerden bei
// Herstellern mit eigenen Markennamen zusaetzlich fremde generische Eintraege auftauchen (z.B. ein generisches
// "PLA" unter Bambu Lab, das es dort unter diesem Namen gar nicht gibt).
export function availableMaterialsFor<T extends MaterialLike>(
  materials: T[],
  manufacturerId: string | null
): T[] {
  const ownMaterials = manufacturerId
    ? materials.filter((material) => material.manufacturerId === manufacturerId)
    : [];
  if (ownMaterials.length > 0) {
    return ownMaterials;
  }
  return materials.filter((material) => material.manufacturerId === null);
}
