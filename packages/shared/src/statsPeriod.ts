// Zeitabschnitte der Verbrauchsstatistik. Alles rechnet in der Zeitzone des Benutzers (Tage beginnen um Mitternacht dort, Wochen am Montag).
export const STATS_PERIODS = ["day", "week", "month", "year"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

// Obergrenze, damit ein riesiger Zeitraum den Server nicht belastet.
export const STATS_MAX_BUCKETS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Kalendertag eines Zeitpunkts in der angegebenen Zeitzone.
function localDate(date: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const pick = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function dayKey(utcMillis: number): string {
  const d = new Date(utcMillis);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Schluessel des Zeitabschnitts: Tag "2026-09-26", Woche = Montag "2026-09-21", Monat "2026-09", Jahr "2026".
export function bucketKey(date: Date, period: StatsPeriod, timeZone: string): string {
  const { year, month, day } = localDate(date, timeZone);
  if (period === "year") {
    return pad(year, 4);
  }
  if (period === "month") {
    return `${pad(year, 4)}-${pad(month)}`;
  }
  const local = Date.UTC(year, month - 1, day);
  if (period === "day") {
    return dayKey(local);
  }
  const sinceMonday = (new Date(local).getUTCDay() + 6) % 7;
  return dayKey(local - sinceMonday * DAY_MS);
}

function nextKey(key: string, period: StatsPeriod): string {
  const [year = 0, month = 1, day = 1] = key.split("-").map(Number);
  if (period === "year") {
    return pad(year + 1, 4);
  }
  if (period === "month") {
    return month === 12 ? `${pad(year + 1, 4)}-01` : `${pad(year, 4)}-${pad(month + 1)}`;
  }
  return dayKey(Date.UTC(year, month - 1, day) + (period === "week" ? 7 : 1) * DAY_MS);
}

// Alle Zeitabschnitte von "from" bis "to" lueckenlos (auch solche ohne Verbrauch), hoechstens STATS_MAX_BUCKETS + 1.
export function listBuckets(from: Date, to: Date, period: StatsPeriod, timeZone: string): string[] {
  const last = bucketKey(to, period, timeZone);
  const keys: string[] = [];
  let key = bucketKey(from, period, timeZone);
  while (key <= last && keys.length <= STATS_MAX_BUCKETS) {
    keys.push(key);
    key = nextKey(key, period);
  }
  return keys;
}

// Standard-Zeitraum je Ansicht: 30 Tage, 12 Wochen, 12 Monate, 5 Jahre (jeweils bis "jetzt").
export function defaultRange(period: StatsPeriod, now: Date): { from: Date; to: Date } {
  const back: Record<StatsPeriod, number> = { day: 29 * DAY_MS, week: 11 * 7 * DAY_MS, month: 11 * 31 * DAY_MS, year: 4 * 366 * DAY_MS };
  return { from: new Date(now.getTime() - back[period]), to: now };
}
