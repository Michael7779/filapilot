import {
  STATS_MAX_BUCKETS,
  bucketKey,
  defaultRange,
  listBuckets,
  materialTypeOf,
  type ConsumptionBreakdownEntry,
  type ConsumptionQuery,
  type ConsumptionStats
} from "@filapilot/shared";
import { AppError } from "../lib/apiResult.js";
import { prisma } from "../prisma.js";

// Obergrenze der gelesenen Verlaufs-Eintraege (Schutz vor riesigen Abfragen).
const MAX_LOG_ROWS = 100_000;

function sortedBreakdown(totals: Map<string, number>): ConsumptionBreakdownEntry[] {
  return [...totals.entries()]
    .map(([label, consumedG]) => ({ label, consumedG }))
    .sort((a, b) => b.consumedG - a.consumedG || a.label.localeCompare(b.label, "de"));
}

function add(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

// Verbrauch ueber die Zeit aus dem Gewichtsverlauf: Summe der positiven Aenderungen je Zeitabschnitt (Erhoehungen des Gewichts
// zaehlen nicht als negativer Verbrauch), aufgeteilt nach Material-Typ und Hersteller, mit Kosten aus Kaufpreis / Ursprungsgewicht.
// Archivierte Spulen zaehlen mit, geloeschte nicht (ihr Verlauf wurde mit geloescht).
export async function computeConsumption(
  inventoryIds: string[],
  query: Pick<ConsumptionQuery, "period" | "from" | "to" | "timeZone">,
  now: Date = new Date()
): Promise<ConsumptionStats> {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from ? new Date(query.from) : defaultRange(query.period, to).from;
  const keys = listBuckets(from, to, query.period, query.timeZone);
  if (keys.length > STATS_MAX_BUCKETS) {
    throw new AppError("VALIDATION_ERROR", `Der Zeitraum ist zu groß (höchstens ${STATS_MAX_BUCKETS} Abschnitte).`);
  }

  const scope = { inventoryId: { in: inventoryIds } };
  const [logs, first] = await Promise.all([
    prisma.spoolWeightLog.findMany({
      where: { ...scope, at: { gte: from, lte: to }, deltaG: { gt: 0 } },
      select: {
        at: true,
        deltaG: true,
        spool: {
          select: {
            initialWeightG: true,
            purchasePriceCents: true,
            material: { select: { name: true } },
            manufacturer: { select: { name: true } }
          }
        }
      },
      orderBy: { at: "asc" },
      take: MAX_LOG_ROWS
    }),
    prisma.spoolWeightLog.aggregate({ where: scope, _min: { at: true } })
  ]);

  const buckets = new Map(keys.map((key) => [key, { key, consumedG: 0, costCents: 0 }]));
  const byType = new Map<string, number>();
  const byManufacturer = new Map<string, number>();
  let costCents = 0;
  let consumedG = 0;
  for (const log of logs) {
    const cost = log.spool.purchasePriceCents === null ? 0 : Math.round((log.deltaG * log.spool.purchasePriceCents) / log.spool.initialWeightG);
    const bucket = buckets.get(bucketKey(log.at, query.period, query.timeZone));
    if (bucket) {
      bucket.consumedG += log.deltaG;
      bucket.costCents += cost;
    }
    add(byType, materialTypeOf(log.spool.material.name), log.deltaG);
    add(byManufacturer, log.spool.manufacturer.name, log.deltaG);
    consumedG += log.deltaG;
    costCents += cost;
  }

  return {
    period: query.period,
    from: from.toISOString(),
    to: to.toISOString(),
    timeZone: query.timeZone,
    buckets: [...buckets.values()],
    totals: { consumedG, costCents },
    byType: sortedBreakdown(byType),
    byManufacturer: sortedBreakdown(byManufacturer),
    trackingSince: first._min.at?.toISOString() ?? null
  };
}
