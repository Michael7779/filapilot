import { Router } from "express";
import { z } from "zod";
import { inventoryAuditQuerySchema } from "@filapilot/shared";
import { sendData } from "../lib/apiResult.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { requireInventoryRole } from "../services/inventoryAccess.js";
import { listInventoryAudit } from "../services/auditService.js";

// Gemountet unter /api/inventories/:id/audit-log
export const inventoryAuditRouter = Router({ mergeParams: true });

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const inventoryParamSchema = z.object({ id: z.string().uuid() });

// Threat-Model: Ein Bearbeiter/Betrachter oder ein Nutzer ohne jeden Zugriff auf das Lager koennte versuchen, dessen
// Protokoll zu lesen (wer hat wann Spulen/Drucker geaendert); ein Besitzer koennte versuchen, ueber Filter an
// Eintraege eines fremden Lagers oder an admin-weite Bereiche (Nutzerverwaltung, Einstellungen) zu kommen.
// Serverseitig erzwungen: Rolle OWNER im Lager (fremd 404, Bearbeiter/Betrachter 403); "inventoryId" wird von der
// Route fest gesetzt, nie aus der Anfrage uebernommen (siehe listInventoryAudit) - andere Bereiche haben nie eine
// inventoryId und tauchen deshalb nie auf.
// Negativ-Tests: anonym -> 401, Fremde -> 404, Bearbeiter/Betrachter -> 403, ungueltige Filter -> 400.
// SCOPE: self (Lager-Besitzer)
inventoryAuditRouter.get(
  "/",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const { id } = inventoryParamSchema.parse(req.params);
    await requireInventoryRole(getAuthenticatedUser(req), id, "OWNER");
    const query = inventoryAuditQuerySchema.parse(req.query);
    sendData(res, await listInventoryAudit(id, query));
  })
);
