import { existsSync } from "node:fs";

// Einige Tests rufen /bin/bash bzw. /usr/bin/tar auf (Linux/Synology/CI). Wo es sie nicht gibt (z.B. Windows-Entwicklung),
// werden genau diese Tests uebersprungen - sichtbar als "skipped" mit Grund, nicht als falscher Fehler oder stiller Erfolg.
export const NO_BASH: string | false = existsSync("/bin/bash") ? false : "/bin/bash fehlt (z.B. Windows)";
export const NO_TAR: string | false = existsSync("/usr/bin/tar") ? false : "/usr/bin/tar fehlt (z.B. Windows)";
