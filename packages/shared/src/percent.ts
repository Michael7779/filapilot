// Prozentangaben werden als Hundertstel-Prozent gespeichert (10 % = 1000, 7,5 % = 750): ganze Zahlen, kein Gleitkomma.
export const MAX_BASIS_POINTS = 10_000;

export type PercentInput = { kind: "empty" } | { kind: "ok"; basisPoints: number } | { kind: "invalid" };

// Eingabe in Prozent (Komma oder Punkt, optional mit %-Zeichen) -> Hundertstel-Prozent. Leer ist erlaubt (= kein Rabatt).
// Erlaubt sind 0 bis 100 mit hoechstens zwei Nachkommastellen.
export function parsePercentInput(text: string): PercentInput {
  // Nur ein Prozentzeichen am Ende ist erlaubt ("7,5 %"), nicht davor oder mittendrin
  const cleaned = text.trim().replace(/%$/, "").trim();
  if (cleaned === "") {
    return { kind: "empty" };
  }
  const [whole = "", fraction, ...rest] = cleaned.split(/[.,]/);
  if (rest.length > 0 || !/^\d{1,3}$/.test(whole) || (fraction !== undefined && !/^\d{1,2}$/.test(fraction))) {
    return { kind: "invalid" };
  }
  const basisPoints = Number(whole) * 100 + Number((fraction ?? "").padEnd(2, "0"));
  return basisPoints <= MAX_BASIS_POINTS ? { kind: "ok", basisPoints } : { kind: "invalid" };
}

// Hundertstel-Prozent als Zahl mit nur den noetigen Nachkommastellen: 750 -> "7,5", 1000 -> "10".
export function formatBasisPoints(basisPoints: number, decimalSeparator: string): string {
  const whole = Math.floor(basisPoints / 100);
  const hundredths = basisPoints % 100;
  if (hundredths === 0) {
    return String(whole);
  }
  const fraction = String(hundredths).padStart(2, "0").replace(/0$/, "");
  return `${whole}${decimalSeparator}${fraction}`;
}
