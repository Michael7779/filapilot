// Kopiert Text in die Zwischenablage. navigator.clipboard gibt es nur in sicheren Kontexten (HTTPS/localhost); die App
// laeuft auf der Synology oft ueber HTTP im Heimnetz - dann greift der Umweg ueber ein verstecktes Textfeld.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Zugriff verweigert - weiter mit dem Umweg
    }
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
