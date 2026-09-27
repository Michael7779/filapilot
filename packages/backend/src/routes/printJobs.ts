import { Router } from "express";
import { printJobListQuerySchema } from "@filapilot/shared";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { listPrintJobs } from "../services/printJobService.js";

export const printJobsRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;

// Threat-Model: Ein Benutzer ohne Zugriff koennte Verbrauch/Kosten fremder Lager, Drucker oder Spulen einsehen.
// Serverseitig erzwungen: "inventoryId=all" nur die eigenen Lager (accessibleInventoryIds), ein konkretes Lager
// braucht VIEWER darin, und ein Drucker-/Spulen-Filter wird auf denselben Bereich geprueft (sonst 404).
// Negativ-Tests: kein Cookie 401, fremdes Lager 404, fremder Drucker/Spule als Filter 404, "all" enthaelt nie fremde Auftraege.
// SCOPE: user
printJobsRouter.get(
  "/",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const query = printJobListQuerySchema.parse(req.query);
    sendData(res, await listPrintJobs(getAuthenticatedUser(req), query));
  })
);
