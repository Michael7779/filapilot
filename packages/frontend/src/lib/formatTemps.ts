// Betttemperatur als Text: "60 °C" bei nur einem Wert, sonst "60–80 °C" als Bereich (Material.bedTempMaxC).
export function formatBedTemp(
  bedTempC: number | null,
  bedTempMaxC: number | null,
  t: (key: string, options: Record<string, unknown>) => string
): string | null {
  if (bedTempC === null) {
    return null;
  }
  return bedTempMaxC !== null
    ? t("spools.bedTempRangeHint", { min: bedTempC, max: bedTempMaxC })
    : t("spools.bedTempHint", { bed: bedTempC });
}
