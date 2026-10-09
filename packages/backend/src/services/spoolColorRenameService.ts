import { importColorName, legacyNearestColorName } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { SYSTEM_ACTOR, recordAudit } from "./auditService.js";

// Einmalige Korrektur aelterer Bambu-Cloud-Importe (0.26.1): bis 0.26.0 wurde der Farbname im RGB-Raum bestimmt (z.B.
// ein helles Gruen als "Grau"). Betroffen sind NUR Spulen aus der Cloud (bambuCloudId), deren Name genau dem alten
// Ergebnis fuer ihren Farbwert entspricht - ein von Hand geaenderter Name wird nie angefasst. lastModifiedAt bleibt
// unveraendert (automatische Korrektur, keine inhaltliche Aenderung durch einen Nutzer); jede Umbenennung steht im Protokoll.
export async function renameLegacyImportColors(): Promise<number> {
  const spools = await prisma.spool.findMany({
    where: { bambuCloudId: { not: null }, colorHex: { not: null } },
    select: {
      id: true,
      colorName: true,
      colorHex: true,
      manufacturer: { select: { name: true } },
      material: { select: { name: true } },
      inventory: { select: { id: true, name: true } }
    }
  });
  let renamed = 0;
  for (const spool of spools) {
    const hex = spool.colorHex?.toUpperCase() ?? null;
    if (!hex || spool.colorName !== legacyNearestColorName(hex)) {
      continue;
    }
    const newName = importColorName(hex, spool.manufacturer.name, spool.material.name);
    if (newName === spool.colorName) {
      continue;
    }
    await prisma.spool.update({ where: { id: spool.id }, data: { colorName: newName } });
    await recordAudit({
      actor: SYSTEM_ACTOR,
      action: "EVENT",
      area: "SPOOL",
      entityId: spool.id,
      inventory: spool.inventory,
      description: `${spool.manufacturer.name} ${spool.material.name}: Farbname vom Import neu zugeordnet (${spool.colorName} -> ${newName})`
    });
    renamed += 1;
  }
  return renamed;
}
