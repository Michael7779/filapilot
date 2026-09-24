import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { getSettings } from "./settingsService.js";
import { recordAudit } from "./auditService.js";

// Threat-Model: Das Aufraeumen loescht Protokoll-Eintraege - ein Admin koennte die Aufbewahrung absichtlich kurz
// stellen, um Spuren zu verwischen. Serverseitig erzwungen: nur Admins duerfen die Einstellung aendern (bestehende
// Route PATCH /api/settings, Zod-Grenzen 0-120), die Aenderung selbst wird protokolliert, und jedes Aufraeumen
// hinterlaesst einen eigenen Eintrag mit der Anzahl. Es gibt keine Route, die frei Eintraege loescht.
// Negativ-Tests: USER darf die Aufbewahrung nicht aendern (403), Werte ausserhalb 0-120 werden abgelehnt (400).

const SYSTEM_ACTOR = { id: null, username: "System" } as const;

// Grenze = jetzt minus N Kalendermonate (UTC).
export function retentionCutoff(months: number, now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

// Loescht Eintraege, die aelter als die eingestellte Aufbewahrung sind (0 = unbegrenzt). Liefert die Anzahl.
export async function pruneAuditLog(now: Date = new Date()): Promise<number> {
  const { auditRetentionMonths } = await getSettings();
  if (auditRetentionMonths <= 0) {
    return 0;
  }
  const { count } = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: retentionCutoff(auditRetentionMonths, now) } }
  });
  if (count > 0) {
    logger.info("Aenderungsprotokoll aufgeraeumt", { removed: count, months: auditRetentionMonths });
    await recordAudit({
      actor: SYSTEM_ACTOR,
      action: "EVENT",
      area: "SETTINGS",
      description: `Protokoll aufgeräumt: ${count} Einträge älter als ${auditRetentionMonths} Monate gelöscht`
    });
  }
  return count;
}
