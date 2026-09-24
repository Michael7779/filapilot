/* eslint-disable security/detect-non-literal-fs-filename -- Der Pfad besteht aus dem festen Upload-Ordner (Umgebung) und einer per Zod geprueften UUID, nie aus Client-Text. */
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Der Dateityp wird an den Anfangsbytes erkannt, nie am vom Client gemeldeten Content-Type oder Dateinamen.
// SVG (kann Skripte enthalten) und alles andere wird bewusst nicht zugelassen.
export function detectImageType(buffer: Buffer): ImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

// Der Dateiname ist die (per Zod als UUID geprueft) Spulen-ID ohne Endung - kein Client-Input im Pfad.
function photoPath(spoolId: string): string {
  return path.join(env.UPLOADS_FOLDER_PATH, "spool-photos", spoolId);
}

export async function savePhoto(spoolId: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(photoPath(spoolId)), { recursive: true });
  await fs.writeFile(photoPath(spoolId), buffer);
}

export async function readPhoto(spoolId: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(photoPath(spoolId));
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

// Ein nicht loeschbares Foto darf das Loeschen der Spule nicht verhindern - es wird laut geloggt.
export async function deletePhoto(spoolId: string): Promise<void> {
  try {
    await fs.rm(photoPath(spoolId), { force: true });
  } catch (err) {
    logger.error("Spulen-Foto konnte nicht geloescht werden", { err, spoolId });
  }
}
