import { apiRequest } from "./api.js";

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

// Handyfotos sind oft 8-12 MB gross: vor dem Upload auf max. 1600 px verkleinern und als JPEG kodieren
// (das Ergebnis liegt typischerweise unter 500 KB und damit weit unter dem Server-Limit von 5 MB).
export async function prepareSpoolPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas nicht verfuegbar");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Bild konnte nicht kodiert werden"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  } finally {
    bitmap.close();
  }
}

export async function uploadSpoolPhoto(spoolId: string, photo: Blob): Promise<void> {
  await apiRequest(`/spools/${spoolId}/photo`, {
    method: "PUT",
    headers: { "Content-Type": photo.type },
    body: photo
  });
}

export async function removeSpoolPhoto(spoolId: string): Promise<void> {
  await apiRequest(`/spools/${spoolId}/photo`, { method: "DELETE" });
}

export async function fetchPhotoUploadEnabled(): Promise<boolean> {
  const result = await apiRequest<{ enabled: boolean }>("/spools/photo-settings");
  return result.enabled;
}

export type PhotoChange =
  | { kind: "none" }
  | { kind: "set"; blob: Blob; previewUrl: string }
  | { kind: "remove" };
