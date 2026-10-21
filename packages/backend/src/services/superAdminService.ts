import { prisma } from "../prisma.js";
import { logger } from "../logger.js";

// Es muss immer mindestens einen Super-Admin geben. Fehlt keiner (Update einer bestehenden Instanz, Wiederherstellung einer
// aelteren Sicherung, Verlust durch gleichzeitige Aenderungen), wird der aelteste Admin einer - er hat die Instanz
// eingerichtet. Idempotent und ohne Wirkung, solange es einen gibt. Liefert den Namen des Befoerderten, sonst null.
export async function ensureSuperAdmin(): Promise<string | null> {
  if ((await prisma.user.count({ where: { isSuperAdmin: true } })) > 0) {
    return null;
  }
  const oldestAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true, username: true } });
  if (!oldestAdmin) {
    return null;
  }
  await prisma.user.update({ where: { id: oldestAdmin.id }, data: { isSuperAdmin: true } });
  logger.info("Es gab keinen Super-Admin - der aelteste Admin wurde dazu ernannt", { username: oldestAdmin.username });
  return oldestAdmin.username;
}
