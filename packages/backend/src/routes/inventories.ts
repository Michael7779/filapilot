import { Router } from "express";
import { z } from "zod";
import {
  addInventoryMemberInputSchema,
  createInventoryInputSchema,
  deleteInventoryInputSchema,
  updateInventoryInputSchema,
  updateInventoryMemberInputSchema
} from "@filapilot/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { AppError, sendData } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";
import { requireInventoryRole } from "../services/inventoryAccess.js";
import { refreshSocketAccess } from "../socket.js";
import {
  addMember,
  changeMemberRole,
  createInventory,
  deleteInventoryWithContents,
  ensureDefaultInventory,
  getInventoryRow,
  listInventories,
  listMemberCandidates,
  listMembers,
  removeMember,
  updateInventory
} from "../services/inventoryService.js";

export const inventoriesRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const idParamSchema = z.string().uuid();
const memberParamsSchema = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

// Threat-Model: Ein angemeldeter Benutzer ohne Mitgliedschaft koennte fremde Lager sehen, umbenennen, loeschen oder sich
// selbst als Mitglied eintragen; ein Betrachter oder Bearbeiter koennte Mitglieder verwalten oder das Lager samt Inhalt
// loeschen. Serverseitig erzwungen: Die Rolle wird bei JEDER Route aus der Datenbank berechnet (requireInventoryRole),
// ohne Zugriff antwortet der Server 404 (das Lager bleibt unsichtbar), Verwalten/Loeschen braucht OWNER (Admins gelten
// ueberall als OWNER), Loeschen zusaetzlich den exakten Lager-Namen, der letzte Besitzer ist geschuetzt, alle Eingaben
// per Zod (Name, Farbe aus fester Palette, UUIDs). Negativ-Tests: kein Cookie -> 401, kein Mitglied -> 404,
// Betrachter/Bearbeiter beim Verwalten -> 403, Loeschen ohne Namen -> 400, letzter Besitzer -> 409.

// SCOPE: user
inventoriesRouter.get(
  "/",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    await ensureDefaultInventory();
    sendData(res, await listInventories(getAuthenticatedUser(req)));
  })
);

// Jeder angemeldete Benutzer darf ein Lager anlegen und wird dessen Besitzer.
// SCOPE: user
inventoriesRouter.post(
  "/",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const input = createInventoryInputSchema.parse(req.body);
    const created = await createInventory(getAuthenticatedUser(req), input);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "CREATE",
      area: "INVENTORY",
      entityId: created.id,
      inventory: created,
      description: created.name,
      after: { name: created.name, color: created.color }
    });
    void refreshSocketAccess();
    sendData(res, created, 201);
  })
);

// SCOPE: user
inventoriesRouter.patch(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = updateInventoryInputSchema.parse(req.body);
    await requireInventoryRole(getAuthenticatedUser(req), id, "OWNER");
    const before = await getInventoryRow(id);
    const updated = await updateInventory(id, input);
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "INVENTORY",
      entityId: id,
      inventory: updated,
      description: updated.name,
      before: { name: before.name, color: before.color },
      after: { name: updated.name, color: updated.color }
    });
    sendData(res, updated);
  })
);

// SCOPE: user
inventoriesRouter.delete(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = deleteInventoryInputSchema.parse(req.body);
    await requireInventoryRole(getAuthenticatedUser(req), id, "OWNER");
    const before = await getInventoryRow(id);
    if (input.confirmName !== before.name) {
      throw new AppError("VALIDATION_ERROR", "Zur Bestaetigung muss der Name des Lagers genau eingegeben werden.");
    }
    const summary = await deleteInventoryWithContents(id);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "DELETE",
      area: "INVENTORY",
      entityId: id,
      inventory: before,
      description: `${before.name} (${summary.spools} Spulen, ${summary.printers} Drucker mit gelöscht)`,
      before: { name: before.name, color: before.color, ...summary }
    });
    void refreshSocketAccess();
    sendData(res, { deleted: true, ...summary });
  })
);

// SCOPE: user
inventoriesRouter.get(
  "/:id/members",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    await requireInventoryRole(getAuthenticatedUser(req), id, "VIEWER");
    sendData(res, await listMembers(id));
  })
);

// SCOPE: user
inventoriesRouter.get(
  "/:id/member-candidates",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    await requireInventoryRole(getAuthenticatedUser(req), id, "OWNER");
    sendData(res, await listMemberCandidates(id));
  })
);

// SCOPE: user
inventoriesRouter.post(
  "/:id/members",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = addInventoryMemberInputSchema.parse(req.body);
    await requireInventoryRole(getAuthenticatedUser(req), id, "OWNER");
    const inventory = await getInventoryRow(id);
    const member = await addMember(id, input.userId, input.role);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "INVENTORY",
      entityId: id,
      inventory,
      description: `${inventory.name}: Mitglied hinzugefügt: ${member.username} (${member.role})`
    });
    void refreshSocketAccess();
    sendData(res, member, 201);
  })
);

// SCOPE: user
inventoriesRouter.patch(
  "/:id/members/:userId",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id, userId } = memberParamsSchema.parse(req.params);
    const input = updateInventoryMemberInputSchema.parse(req.body);
    await requireInventoryRole(getAuthenticatedUser(req), id, "OWNER");
    const inventory = await getInventoryRow(id);
    const member = await changeMemberRole(id, userId, input.role);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "INVENTORY",
      entityId: id,
      inventory,
      description: `${inventory.name}: Rolle geändert: ${member.username} → ${member.role}`
    });
    void refreshSocketAccess();
    sendData(res, member);
  })
);

// Besitzer entfernen Mitglieder; jedes Mitglied darf sich selbst entfernen ("Lager verlassen").
// SCOPE: user
inventoriesRouter.delete(
  "/:id/members/:userId",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id, userId } = memberParamsSchema.parse(req.params);
    const user = getAuthenticatedUser(req);
    await requireInventoryRole(user, id, userId === user.id ? "VIEWER" : "OWNER");
    const inventory = await getInventoryRow(id);
    const removed = await removeMember(id, userId);
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "INVENTORY",
      entityId: id,
      inventory,
      description: `${inventory.name}: Mitglied entfernt: ${removed.username}`
    });
    void refreshSocketAccess();
    sendData(res, { removed: true });
  })
);
