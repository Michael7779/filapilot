// Fast alle Consumer-Drucker (auch die Bambu-AMS) verwenden 1,75mm-Filament; das ist der Vorgabewert eines
// Materials (Material.filamentDiameterMm), falls keiner bekannt ist.
export const DEFAULT_FILAMENT_DIAMETER_MM = 1.75;

// Ungefaehre Restlaenge in Metern aus Restgewicht, Dichte (g/cm3) und Durchmesser (mm) - eine Naeherung, keine
// Messung. Ohne bekannte Dichte (Material ohne Angabe) gibt es keinen Wert.
export function estimateRemainingLengthM(
  remainingWeightG: number,
  densityGCm3: number | null,
  diameterMm: number = DEFAULT_FILAMENT_DIAMETER_MM
): number | null {
  if (remainingWeightG <= 0) {
    return 0;
  }
  if (densityGCm3 === null || densityGCm3 <= 0 || diameterMm <= 0) {
    return null;
  }
  const volumeCm3 = remainingWeightG / densityGCm3;
  const radiusCm = diameterMm / 10 / 2;
  const crossSectionCm2 = Math.PI * radiusCm * radiusCm;
  return volumeCm3 / crossSectionCm2 / 100;
}
