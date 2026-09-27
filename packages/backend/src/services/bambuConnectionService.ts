import { bambuRegionSchema, type BambuConnectionInfo, type BambuRegion } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { decryptSecret, encryptSecret } from "../lib/secretCrypto.js";
import { getSettings } from "./settingsService.js";

// Liest den Ablauf (exp) aus dem Zugangs-Token, nur zur Anzeige. Ohne Pruefung der Signatur - das Token wird nie als Beweis benutzt.
export function tokenExpiry(token: string): Date | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const exp = typeof parsed === "object" && parsed !== null && "exp" in parsed ? (parsed as { exp: unknown }).exp : null;
    return typeof exp === "number" && Number.isFinite(exp) ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

// Merkt die Verbindung eines Lagers (ersetzt eine vorhandene). Das Token wird verschluesselt gespeichert.
export async function saveConnection(input: {
  inventoryId: string;
  region: BambuRegion;
  token: string;
  connectedByName: string;
}): Promise<void> {
  const data = {
    region: input.region,
    tokenEncrypted: encryptSecret(input.token),
    tokenExpiresAt: tokenExpiry(input.token),
    connectedByName: input.connectedByName,
    connectedAt: new Date(),
    lastSyncAt: null,
    lastSyncSummary: null,
    lastAttemptAt: null,
    lastSyncAuto: false,
    lastSyncError: null
  };
  await prisma.bambuConnection.upsert({
    where: { inventoryId: input.inventoryId },
    create: { inventoryId: input.inventoryId, ...data },
    update: data
  });
}

// Das gemerkte Token eines Lagers, oder null (keine Verbindung / nicht entschluesselbar, z.B. nach einem Umzug mit anderem SESSION_SECRET).
export async function getStoredToken(inventoryId: string): Promise<{ region: BambuRegion; token: string } | null> {
  const row = await prisma.bambuConnection.findUnique({ where: { inventoryId } });
  if (!row) {
    return null;
  }
  const region = bambuRegionSchema.safeParse(row.region);
  if (!region.success) {
    return null;
  }
  try {
    return { region: region.data, token: decryptSecret(row.tokenEncrypted) };
  } catch (err) {
    logger.warn("Gemerktes Bambu-Token konnte nicht entschluesselt werden (anderes SESSION_SECRET?)", { err });
    return null;
  }
}

// Status fuer die Oberflaeche - nie mit dem Token.
export async function getConnectionInfo(inventoryId: string): Promise<BambuConnectionInfo> {
  const { bambuAutoSyncMinutes } = await getSettings();
  const usable = await getStoredToken(inventoryId);
  const row = usable ? await prisma.bambuConnection.findUnique({ where: { inventoryId } }) : null;
  if (!usable || !row) {
    return { connected: false, region: null, connectedByName: null, connectedAt: null, tokenExpiresAt: null, lastSyncAt: null, lastSyncSummary: null, lastAttemptAt: null, lastSyncAuto: false, lastSyncError: null, autoSyncMinutes: bambuAutoSyncMinutes };
  }
  return {
    connected: true,
    region: usable.region,
    connectedByName: row.connectedByName,
    connectedAt: row.connectedAt.toISOString(),
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncSummary: row.lastSyncSummary,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    lastSyncAuto: row.lastSyncAuto,
    lastSyncError: row.lastSyncError,
    autoSyncMinutes: bambuAutoSyncMinutes
  };
}

export async function deleteConnection(inventoryId: string): Promise<boolean> {
  const { count } = await prisma.bambuConnection.deleteMany({ where: { inventoryId } });
  return count > 0;
}

export async function markSynced(inventoryId: string, summary: string, auto = false): Promise<void> {
  const now = new Date();
  await prisma.bambuConnection.updateMany({
    where: { inventoryId },
    data: { lastSyncAt: now, lastAttemptAt: now, lastSyncAuto: auto, lastSyncSummary: summary, lastSyncError: null }
  });
}

// Fehlgeschlagener Versuch: merkt Zeit und Grund, damit der Zeitplan nicht dauernd neu versucht und die Oberflaeche den Grund zeigt.
export async function markSyncFailed(inventoryId: string, message: string, auto: boolean): Promise<void> {
  await prisma.bambuConnection.updateMany({
    where: { inventoryId },
    data: { lastAttemptAt: new Date(), lastSyncAuto: auto, lastSyncError: message.slice(0, 300) }
  });
}
