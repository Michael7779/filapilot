import type { SpoolWithRelations } from "./schemas/spool.js";

export type SpoolPackaging = "REFILL" | "WITH_SPOOL";

// Lieferform ("Nachfuellung" oder "Filament mit Spule") gibt es nur bei noch nicht angebrochenen, nicht archivierten Spulen -
// danach ist sie fuer den Bestand ohne Bedeutung. null = nichts anzeigen.
export function spoolPackaging(spool: Pick<SpoolWithRelations, "openedAt" | "archivedAt" | "isRefill">): SpoolPackaging | null {
  if (spool.openedAt || spool.archivedAt) {
    return null;
  }
  return spool.isRefill ? "REFILL" : "WITH_SPOOL";
}
