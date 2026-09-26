import { z } from "zod";
import { STATS_PERIODS, isValidTimeZone } from "../statsPeriod.js";

export const consumptionQuerySchema = z
  .object({
    inventoryId: z.union([z.literal("all"), z.string().uuid()]),
    period: z.enum(STATS_PERIODS),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    timeZone: z.string().max(64).refine(isValidTimeZone, "Ungueltige Zeitzone").default("UTC")
  })
  .refine((value) => !value.from || !value.to || new Date(value.from) < new Date(value.to), "Der Zeitraum ist ungueltig (von muss vor bis liegen).");
export type ConsumptionQuery = z.infer<typeof consumptionQuerySchema>;

export interface ConsumptionBucket {
  // Schluessel des Zeitabschnitts (Tag/Montag der Woche/Monat/Jahr, siehe bucketKey)
  key: string;
  consumedG: number;
  costCents: number;
}

export interface ConsumptionBreakdownEntry {
  label: string;
  consumedG: number;
}

export interface ConsumptionStats {
  period: (typeof STATS_PERIODS)[number];
  from: string;
  to: string;
  timeZone: string;
  buckets: ConsumptionBucket[];
  totals: { consumedG: number; costCents: number };
  byType: ConsumptionBreakdownEntry[];
  byManufacturer: ConsumptionBreakdownEntry[];
  // Seit wann Aenderungen des Restgewichts erfasst werden (frueherer Verbrauch hat kein Datum), sonst null
  trackingSince: string | null;
}
