import { Router } from "express";
import { setSizzleOrderCostInputSchema, type SizzleOrderCost } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData } from "../lib/apiResult.js";
import { getAuthenticatedUser } from "../middleware/auth.js";
import { requireSizzleAccess } from "../middleware/access.js";
import { actorFromRequest, recordAudit } from "../services/auditService.js";

export const sizzleCostsRouter = Router();

// Es gibt nur eine Sammelbestellung, also genau eine Zeile.
const COST_ID = 1;
const COST_SELECT = { shippingCents: true, discountCents: true } as const;

const euro = (cents: number): string => `${(cents / 100).toFixed(2)} EUR`;

// Threat-Model: Anonym oder ohne Sizzle-Freigabe darf niemand Versand und Rabatt sehen oder setzen (401/403). Wie Status, Auswahl und
// Preis der Bestellliste darf sie jeder Freigegebene setzen (gemeinsame Sammelbestellung, jede Aenderung steht im Protokoll).
// Serverseitig erzwungen: nur ganze Cent-Betraege 0..1.000.000 und ausschliesslich shippingCents/discountCents (strict, sonst 400).
// Negativ-Tests: tests/security/sizzle.test.ts.
// SCOPE: user
sizzleCostsRouter.get(
  "/",
  ...requireSizzleAccess,
  asyncHandler(async (_req, res) => {
    const cost = await prisma.sizzleOrderCost.findUnique({ where: { id: COST_ID }, select: COST_SELECT });
    sendData(res, (cost ?? { shippingCents: 0, discountCents: 0 }) satisfies SizzleOrderCost);
  })
);

// SCOPE: user
sizzleCostsRouter.put(
  "/",
  ...requireSizzleAccess,
  asyncHandler(async (req, res) => {
    const input = setSizzleOrderCostInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    const data = { ...input, updatedByUserId: user.id, updatedByName: user.username };
    const saved = await prisma.sizzleOrderCost.upsert({ where: { id: COST_ID }, create: { id: COST_ID, ...data }, update: data, select: COST_SELECT });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "SIZZLE",
      description: `Versand ${euro(saved.shippingCents)}, Rabatt ${euro(saved.discountCents)}`
    });
    sendData(res, saved satisfies SizzleOrderCost);
  })
);
