// Laedt eine Datei ueber die API herunter (statt eines <a href>-Links): der Service Worker der PWA faengt sonst
// jede direkte Navigation zu /api/... ab und liefert die App-Huelle zurueck (leere Seite) statt die Datei.
// Ausserdem laesst sich so ein echter Fehler (401/404) anzeigen, statt dass der Browser eine Fehlerseite oeffnet.
export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(`/api${path}`, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Herunterladen fehlgeschlagen (${response.status})`);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Speichert Text als Datei direkt im Browser (kein Server noetig), z.B. die Abrechnung als CSV. Das BOM vorne sorgt dafuer,
// dass Excel Umlaute richtig liest.
export function saveTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob(["﻿", content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
