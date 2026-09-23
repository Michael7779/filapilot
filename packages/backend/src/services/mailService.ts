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

  try {
    await transport.sendMail({
      from: settings.smtp.fromAddress,
      to: toEmail,
      subject: "FilaPilot - Passwort zuruecksetzen",
      text: `Klicke auf diesen Link, um dein Passwort zurueckzusetzen: ${resetLink}\n\nDer Link ist 1 Stunde gueltig.`
    });
  } catch (err) {
    // Kein 500: sonst wuerde die Antwort verraten, ob die E-Mail-Adresse existiert.
    logger.error("Passwort-Reset-Mail konnte nicht gesendet werden", { toEmail, resetLink, err });
  }
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

  try {
    await transport.sendMail({
      from: settings.smtp.fromAddress,
      to: toEmail,
      subject: "Dein FilaPilot-Zugang",
      text: `Dein Zugang wurde erstellt.\n\nBenutzername: ${username}\nStart-Passwort: ${temporaryPassword}\n\nAnmelden: ${loginLink}`
    });
    return true;
  } catch (err) {
    // false => der Aufrufer zeigt das Start-Passwort dem Admin direkt an, statt es zu verlieren.
    logger.error("Zugangs-Mail konnte nicht gesendet werden", { toEmail, username, err });
    return false;
  }
}
