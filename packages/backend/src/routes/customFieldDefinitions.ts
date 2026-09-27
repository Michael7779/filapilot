import { Router } from "express";
import { z } from "zod";
import { createCustomFieldDefinitionInputSchema, type CustomFieldDefinition } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { requireAuth, requirePasswordAlreadyChanged, requireRole } from "../middleware/auth.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";

export const customFieldDefinitionsRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const requireAdmin = [...requireActiveUser, requireRole("ADMIN")] as const;
const idParamSchema = z.string().uuid();
const updateRequiredInputSchema = z.object({ required: z.boolean() });

function toPublic(row: { id: string; name: string; kind: string; required: boolean; createdAt: Date }): CustomFieldDefinition {
  return { id: row.id, name: row.name, kind: row.kind as CustomFieldDefinition["kind"], required: row.required, createdAt: row.createdAt };
}

// Threat-Model: Ein normaler Benutzer koennte versuchen, Zusatzfelder anzulegen oder zu loeschen und damit die
// Spulen-Formulare aller Nutzer der Instanz zu veraendern. Serverseitig erzwungen: Lesen fuer jeden eingeloggten
// Nutzer (die Felder erscheinen im Formular jedes Nutzers), Anlegen/Loeschen nur Admin; Name ist eindeutig (409).
// Negativ-Tests: kein Cookie -> 401, USER beim Schreiben -> 403, doppelter Name -> 409.
// SCOPE: user
customFieldDefinitionsRouter.get(
  "/",
  ...requireActiveUser,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.customFieldDefinition.findMany({ orderBy: { name: "asc" } });
    sendData(res, rows.map(toPublic));
  })
);

// SCOPE: global
customFieldDefinitionsRouter.post(
  "/",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const input = createCustomFieldDefinitionInputSchema.parse(req.body);
    const created = await prisma.customFieldDefinition.create({ data: input }).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        throw new AppError("CONFLICT", "Ein Zusatzfeld mit diesem Namen existiert bereits.");
      }
      throw err;
    });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "CREATE",
      area: "CUSTOM_FIELD",
      entityId: created.id,
      description: `${created.name} (${created.kind})`,
      after: { name: created.name, kind: created.kind, required: created.required }
    });
    sendData(res, toPublic(created), 201);
  })
);

// Nur "required" ist aenderbar (nicht Name/Typ - das haette Auswirkungen auf bereits gespeicherte Werte).
// Threat-Model: wie oben (nur Admin, sonst 403); nicht existentes Feld -> 404.
// SCOPE: global
customFieldDefinitionsRouter.patch(
  "/:id",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = updateRequiredInputSchema.parse(req.body);
    const before = await prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!before) {
      throw new AppError("NOT_FOUND", "Zusatzfeld wurde nicht gefunden.");
    }
    const updated = await prisma.customFieldDefinition.update({ where: { id }, data: { required: input.required } });
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "CUSTOM_FIELD",
      entityId: id,
      description: `${updated.name} (${updated.kind})`,
      before: { name: before.name, kind: before.kind, required: before.required },
      after: { name: updated.name, kind: updated.kind, required: updated.required }
    });
    sendData(res, toPublic(updated));
  })
);

// SCOPE: global
customFieldDefinitionsRouter.delete(
  "/:id",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const before = await prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!before) {
      throw new AppError("NOT_FOUND", "Zusatzfeld wurde nicht gefunden.");
    }
    // Raeumt vorhandene Werte dieses Feldes aus allen Spulen auf (sonst blieben sie unsichtbar, aber gespeichert,
    // liegen). Eine Anweisung fuer alle betroffenen Zeilen statt einer Schleife (kein N+1).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE spools SET "customFields" = "customFields" - ${id} WHERE "customFields" ? ${id}`;
      await tx.customFieldDefinition.delete({ where: { id } });
    });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "DELETE",
      area: "CUSTOM_FIELD",
      entityId: id,
      description: `${before.name} (${before.kind})`,
      before: { name: before.name, kind: before.kind, required: before.required }
    });
    sendData(res, { deleted: true });
  })
);
