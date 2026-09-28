import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { getSettings } from "./settingsService.js";

let running: Promise<void> | null = null;

// Einmaliger Nachtrag beim Update auf 0.22.0: Spulen, die es schon vor "openedAt" gab, haben das Feld leer (null) -
// ohne diesen Nachtrag wuerden sie in der neuen Gruppierung faelschlich als "ungeoeffnet" erscheinen, obwohl sie
// laengst in Benutzung sind. Setzt fuer sie openedAt auf ihr Anlage-Datum. Das Settings-Flag "openedAtBackfilled"
// sorgt dafuer, dass das genau einmal passiert - ein zweiter Lauf wuerde sonst auch echte neue, gerade erst
// angelegte ungeoeffnete Spulen faelschlich als geoeffnet markieren. Wiederholbar ohne Wirkung (wie ensureDefaultInventory).
// Ruft getSettings() (nicht selbst upsert) auf, damit die Settings-Zeile mit dem richtigen Backup-Pfad aus der
// Umgebung entsteht, falls sie noch nicht existiert - nicht mit dem Schema-Standardwert.
async function backfill(): Promise<void> {
  await getSettings();
  const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 }, select: { openedAtBackfilled: true } });
  if (settings.openedAtBackfilled) {
    return;
  }
  const result = await prisma.$executeRaw`UPDATE spools SET "openedAt" = "createdAt" WHERE "openedAt" IS NULL`;
  await prisma.settings.update({ where: { id: 1 }, data: { openedAtBackfilled: true } });
  if (result > 0) {
    logger.info("Bestehende Spulen auf 'geoeffnet' nachgetragen (openedAt = Anlage-Datum)", { count: result });
  }
}

export function ensureOpenedAtBackfilled(): Promise<void> {
  running ??= backfill().finally(() => {
    running = null;
  });
  return running;
}
