// Alle gaengigen Consumer-Drucker (auch die Bambu-AMS) verwenden 1,75mm-Filament; wird nicht pro Material gepflegt.
const FILAMENT_DIAMETER_MM = 1.75;

// Ungefaehre Restlaenge in Metern aus Restgewicht und Dichte (g/cm3) - eine Naeherung anhand des
// Standard-Durchmessers, keine Messung. Ohne bekannte Dichte (Material ohne Angabe) gibt es keinen Wert.
export function estimateRemainingLengthM(remainingWeightG: number, densityGCm3: number | null): number | null {
  if (remainingWeightG <= 0) {
    return 0;
  }
  if (densityGCm3 === null || densityGCm3 <= 0) {
    return null;
  }
  const volumeCm3 = remainingWeightG / densityGCm3;
  const radiusCm = FILAMENT_DIAMETER_MM / 10 / 2;
  const crossSectionCm2 = Math.PI * radiusCm * radiusCm;
  return volumeCm3 / crossSectionCm2 / 100;
}
