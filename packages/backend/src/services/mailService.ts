import nodemailer from "nodemailer";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { getSettings, getDecryptedSmtpPassword } from "./settingsService.js";

async function getTransport() {
  const settings = await getSettings();
  if (!settings.smtp) {
    return null;
  }
  const password = await getDecryptedSmtpPassword();
  return nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    auth: { user: settings.smtp.username, pass: password ?? undefined }
  });
}

export async function sendPasswordResetEmail(toEmail: string, rawToken: string): Promise<void> {
  const transport = await getTransport();
  const settings = await getSettings();
  const resetLink = `${env.FRONTEND_ORIGIN}/passwort-zuruecksetzen?token=${rawToken}`;

  if (!transport || !settings.smtp) {
    logger.warn("Kein SMTP konfiguriert - Passwort-Reset-Link wird nur geloggt.", {
      toEmail,
      resetLink
    });
    return;
  }

  await transport.sendMail({
    from: settings.smtp.fromAddress,
    to: toEmail,
    subject: "FilaPilot - Passwort zuruecksetzen",
    text: `Klicke auf diesen Link, um dein Passwort zurueckzusetzen: ${resetLink}\n\nDer Link ist 1 Stunde gueltig.`
  });
}

// Gibt zurueck, ob die Mail wirklich verschickt wurde - der Aufrufer nutzt das, um das
// Start-Passwort ausnahmsweise in der API-Antwort mitzugeben, wenn es sonst niemand erreicht
// (kein SMTP konfiguriert).
export async function sendNewAccountEmail(
  toEmail: string,
  username: string,
  temporaryPassword: string
): Promise<boolean> {
  const transport = await getTransport();
  const settings = await getSettings();
  const loginLink = `${env.FRONTEND_ORIGIN}/login`;

  if (!transport || !settings.smtp) {
    logger.warn("Kein SMTP konfiguriert - Zugangsdaten werden nur geloggt.", { toEmail, username });
    return false;
  }

  await transport.sendMail({
    from: settings.smtp.fromAddress,
    to: toEmail,
    subject: "Dein FilaPilot-Zugang",
    text: `Dein Zugang wurde erstellt.\n\nBenutzername: ${username}\nStart-Passwort: ${temporaryPassword}\n\nAnmelden: ${loginLink}`
  });
  return true;
}
