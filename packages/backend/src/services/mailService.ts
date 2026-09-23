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
    auth: { user: settings.smtp.username, pass: password ?? undefined },
    // Ohne Zeitlimits wuerde ein falscher Server/Port die Anfrage minutenlang haengen lassen.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });
}

export interface MailTestResult {
  ok: boolean;
  message: string | null;
}

// Schickt eine Test-Mail und gibt den Fehlertext des Mailservers zurueck, statt ihn zu verschlucken -
// der Admin soll sehen, woran es liegt (falsches Passwort, falscher Port, ...). Die Fehlermeldungen
// von nodemailer enthalten keine Zugangsdaten.
export async function sendTestEmail(toEmail: string): Promise<MailTestResult> {
  const transport = await getTransport();
  const settings = await getSettings();
  if (!transport || !settings.smtp) {
    return { ok: false, message: "Es ist noch kein SMTP-Server gespeichert." };
  }
  try {
    await transport.sendMail({
      from: settings.smtp.fromAddress,
      to: toEmail,
      subject: "FilaPilot - Test-E-Mail",
      text: "Der E-Mail-Versand von FilaPilot funktioniert."
    });
    return { ok: true, message: null };
  } catch (err) {
    logger.warn("SMTP-Test fehlgeschlagen", { err });
    return { ok: false, message: err instanceof Error ? err.message : "Unbekannter Fehler." };
  }
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
// (kein SMTP konfiguriert oder Versand fehlgeschlagen).
async function sendCredentialsEmail(
  toEmail: string,
  username: string,
  temporaryPassword: string,
  subject: string,
  intro: string
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
      subject,
      text: `${intro}

Benutzername: ${username}
Start-Passwort: ${temporaryPassword}

Anmelden: ${loginLink}`
    });
    return true;
  } catch (err) {
    // false => der Aufrufer zeigt das Start-Passwort dem Admin direkt an, statt es zu verlieren.
    logger.error("Zugangs-Mail konnte nicht gesendet werden", { toEmail, username, err });
    return false;
  }
}

export function sendNewAccountEmail(
  toEmail: string,
  username: string,
  temporaryPassword: string
): Promise<boolean> {
  return sendCredentialsEmail(
    toEmail,
    username,
    temporaryPassword,
    "Dein FilaPilot-Zugang",
    "Dein Zugang wurde erstellt."
  );
}

export function sendPasswordResetByAdminEmail(
  toEmail: string,
  username: string,
  temporaryPassword: string
): Promise<boolean> {
  return sendCredentialsEmail(
    toEmail,
    username,
    temporaryPassword,
    "FilaPilot - Dein Passwort wurde zurueckgesetzt",
    "Ein Administrator hat dein Passwort zurueckgesetzt. Du musst beim naechsten Anmelden ein neues vergeben."
  );
}
