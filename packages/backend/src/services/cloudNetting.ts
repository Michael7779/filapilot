// Das Restgewicht der Bambu-Cloud schwankt auch nach oben. Ohne Verrechnung zaehlte jede Abnahme als Verbrauch, die
// Zunahme danach aber nie - der Verbrauch wuchs, obwohl nichts gedruckt wurde. Eine Zunahme aus der Cloud hebt deshalb
// fruehere Abnahmen aus der Cloud derselben Spule auf (die juengste zuerst). Druck-, Wiege- und Handbuchungen bleiben.

const CLOUD_SOURCES: ReadonlySet<string> = new Set(["CLOUD_SYNC", "CLOUD_IMPORT"]);

interface WeightEntry {
  spoolId: string;
  at: Date;
  // positiv = verbraucht, negativ = Gewicht erhoeht
  deltaG: number;
  source: string;
}

function offset(open: WeightEntry[], gainG: number): void {
  let rest = gainG;
  let latest = open.at(-1);
  while (rest > 0 && latest) {
    const taken = Math.min(latest.deltaG, rest);
    latest.deltaG -= taken;
    rest -= taken;
    if (latest.deltaG === 0) {
      open.pop();
    }
    latest = open.at(-1);
  }
}

// Erwartet die Eintraege nach Zeit aufsteigend und gibt den verbleibenden Verbrauch zurueck (Kopien, nur positive Mengen).
export function netCloudFluctuations<T extends WeightEntry>(entries: readonly T[]): T[] {
  const consumption: T[] = [];
  const openCloud = new Map<string, T[]>();
  for (const entry of entries) {
    const fromCloud = CLOUD_SOURCES.has(entry.source);
    const open = openCloud.get(entry.spoolId) ?? [];
    if (entry.deltaG > 0) {
      const copy = { ...entry };
      consumption.push(copy);
      if (fromCloud) {
        openCloud.set(entry.spoolId, [...open, copy]);
      }
    } else if (fromCloud) {
      offset(open, -entry.deltaG);
    }
  }
  return consumption.filter((entry) => entry.deltaG > 0);
}
