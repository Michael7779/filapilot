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
