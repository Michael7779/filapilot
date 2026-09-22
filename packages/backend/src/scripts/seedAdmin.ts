import { prisma } from "../prisma.js";
import { generateRandomPassword, hashPassword } from "../services/authService.js";
import { logger } from "../logger.js";

// Einmaliges Bootstrap-Skript: legt den allerersten Admin-Account an, falls die Datenbank noch
// leer ist. Idempotent - tut nichts, wenn schon irgendein Nutzer existiert (kein SCOPE-Kommentar
// noetig, es ist kein HTTP-Handler und laeuft nur lokal/per Admin-Aufruf, nie ueber die API).
async function seedAdmin(): Promise<void> {
  const existingUserCount = await prisma.user.count();
  if (existingUserCount > 0) {
    logger.info("Seed uebersprungen - es existiert bereits mindestens ein Nutzer.");
    return;
  }

  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@filapilot.local";
  const temporaryPassword = generateRandomPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      role: "ADMIN",
      mustChangePassword: true
    }
  });

  // Bewusst console.log statt Logger: das Start-Passwort muss auf der Konsole des Admins landen,
  // der das Skript ausfuehrt (docker compose exec) - nicht in einer Log-Datei, die andere lesen
  // koennten.
  console.log(`
========================================================
Erster Admin-Account angelegt:

  Benutzername: ${username}
  Start-Passwort: ${temporaryPassword}

Bei der ersten Anmeldung muss das Passwort geaendert werden.
Dieses Passwort wird nirgendwo sonst gespeichert - jetzt notieren!
========================================================
`);
}

seedAdmin()
  .catch((err: unknown) => {
    logger.error("Seed fehlgeschlagen", { err });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
