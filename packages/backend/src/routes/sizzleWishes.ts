import { Router } from "express";
import { z } from "zod";
import {
  SIZZLE_CONTENT_FIELDS,
  bulkUpdateSizzleWishesInputSchema,
  createSizzleWishInputSchema,
  sizzleProductLabel,
  updateSizzleWishInputSchema,
  type SizzleWish
} from "@filapilot/shared";
import type { SizzleProduct as PrismaSizzleProduct, SizzleWish as PrismaSizzleWish } from "@prisma/client";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { AppError, sendData } from "../lib/apiResult.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { getAuthenticatedUser } from "../middleware/auth.js";
import { requireSizzleAccess } from "../middleware/access.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";
import { toPublicProduct } from "../services/sizzleCatalogService.js";
import { bulkUpdateWishes } from "../services/sizzleWishService.js";

export const sizzleWishesRouter = Router();

const idParamSchema = z.string().uuid();
const WISH_INCLUDE = { product: true } as const;
const MAX_QUANTITY = 999;

type WishRow = PrismaSizzleWish & { product: PrismaSizzleProduct };

function toPublic(row: WishRow): SizzleWish {
  return {
    id: row.id,
    product: toPublicProduct(row.product),
    quantity: row.quantity,
    note: row.note,
    status: row.status,
    inOrder: row.inOrder,
    unitPriceCents: row.unitPriceCents,
    addedByUserId: row.addedByUserId,
    addedByName: row.addedByName,
    createdAt: row.createdAt,
    updatedByName: row.updatedByName,
    updatedAt: row.updatedAt
  };
}

function describeWish(row: WishRow): string {
  return `${row.quantity}x ${sizzleProductLabel(row.product)}`;
}

function snapshot(row: WishRow): Record<string, unknown> {
  return {
    product: sizzleProductLabel(row.product),
    quantity: row.quantity,
    note: row.note,
    status: row.status,
    inOrder: row.inOrder,
    unitPriceCents: row.unitPriceCents
  };
}

async function findWishOrThrow(id: string): Promise<WishRow> {
  const wish = await prisma.sizzleWish.findUnique({ where: { id }, include: WISH_INCLUDE });
  if (!wish) {
    throw new AppError("NOT_FOUND", "Wunsch wurde nicht gefunden.");
  }
  return wish;
}

// Neue Wuensche gibt es nur fuer Produkte, die der Shop aktuell fuehrt.
async function findActiveProductOrThrow(productId: string): Promise<PrismaSizzleProduct> {
  const product = await prisma.sizzleProduct.findUnique({ where: { id: productId } });
  if (!product?.active) {
    throw new AppError("VALIDATION_ERROR", "Unbekanntes oder nicht mehr erhaeltliches Produkt.");
  }
  return product;
}

// Threat-Model: Ein anderer Freigegebener koennte Produkt/Menge/Notiz eines fremden Wunsches aendern oder ihn loeschen, oder ueber
// die Sammel-Route die Ersteller-Pruefung umgehen; ohne Freigabe darf niemand etwas sehen (401/403). Serverseitig erzwungen:
// Lesen/Anlegen/Status/Auswahl/Preis jeder Freigegebene (Sammelbestellung, wie die Filament-Wunschliste); Inhalt aendern oder
// loeschen nur Ersteller oder Admin (403); die Sammel-Route ist strict() und kennt keinen Inhalt (400), max. 500 IDs; Preise nur
// ganze Cent 0..1.000.000; ein Preis ausserhalb der Bestellliste ist nicht moeglich. Negativ-Tests: tests/security/sizzle.test.ts.
// SCOPE: user
sizzleWishesRouter.get(
  "/",
  ...requireSizzleAccess,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.sizzleWish.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 500,
      include: WISH_INCLUDE
    });
    sendData(res, rows.map(toPublic));
  })
);

// Eigene Wuensche werden zusammengefasst: wer dasselbe Produkt nochmal waehlt, erhoeht die Menge des offenen Wunsches.
// SCOPE: user
sizzleWishesRouter.post(
  "/",
  ...requireSizzleAccess,
  asyncHandler(async (req, res) => {
    const input = createSizzleWishInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    await findActiveProductOrThrow(input.productId);
    const open = await prisma.sizzleWish.findFirst({
      where: { productId: input.productId, addedByUserId: user.id, status: "OPEN", inOrder: false }
    });
    if (open) {
      const merged = await prisma.sizzleWish.update({
        where: { id: open.id },
        data: { quantity: Math.min(MAX_QUANTITY, open.quantity + input.quantity), note: input.note ?? open.note, updatedByUserId: user.id, updatedByName: user.username },
        include: WISH_INCLUDE
      });
      await recordAudit({ actor: actorFromRequest(req), action: "UPDATE", area: "SIZZLE", entityId: merged.id, description: describeWish(merged), after: snapshot(merged) });
      sendData(res, toPublic(merged));
      return;
    }
    const created = await prisma.sizzleWish.create({
      data: { productId: input.productId, quantity: input.quantity, note: input.note, addedByUserId: user.id, addedByName: user.username },
      include: WISH_INCLUDE
    });
    await recordAudit({ actor: actorFromRequest(req), action: "CREATE", area: "SIZZLE", entityId: created.id, description: describeWish(created), after: snapshot(created) });
    sendData(res, toPublic(created), 201);
  })
);

// Aufraeumen: entfernt alle erledigten Wuensche auf einmal. Wie der Status darf das jeder Freigegebene.
// SCOPE: user
sizzleWishesRouter.delete(
  "/done",
  ...requireSizzleAccess,
  asyncHandler(async (req, res) => {
    const result = await prisma.sizzleWish.deleteMany({ where: { status: "DONE" } });
    if (result.count > 0) {
      await recordAudit({ actor: actorFromRequest(req), action: "EVENT", area: "SIZZLE", description: `${result.count} erledigte Wuensche entfernt` });
    }
    sendData(res, { deleted: result.count });
  })
);

// Muss vor "/:id" stehen, sonst wuerde "bulk" als ID gelesen.
// SCOPE: user
sizzleWishesRouter.patch(
  "/bulk",
  ...requireSizzleAccess,
  asyncHandler(async (req, res) => {
    const input = bulkUpdateSizzleWishesInputSchema.parse(req.body);
    const updated = await bulkUpdateWishes(input, getAuthenticatedUser(req));
    if (updated > 0) {
      const changes: string[] = [];
      if (input.status) {
        changes.push(`Status ${input.status}`);
      }
      if (input.inOrder !== undefined) {
        changes.push(input.inOrder ? "in die Bestellliste" : "aus der Bestellliste");
      }
      if (input.unitPriceCents !== undefined) {
        changes.push("Preis");
      }
      await recordAudit({ actor: actorFromRequest(req), action: "EVENT", area: "SIZZLE", description: `${updated} Wuensche geaendert (${changes.join(", ")})` });
    }
    sendData(res, { updated });
  })
);

// SCOPE: self (Inhalt) bzw. user (Status, Bestellliste-Auswahl, Preis)
sizzleWishesRouter.patch(
  "/:id",
  ...requireSizzleAccess,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = updateSizzleWishInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    const before = await findWishOrThrow(id);

    if (SIZZLE_CONTENT_FIELDS.some((field) => input[field] !== undefined) && user.role !== "ADMIN" && user.id !== before.addedByUserId) {
      throw new AppError("FORBIDDEN", "Nur wer den Wunsch hinzugefuegt hat oder ein Admin darf ihn aendern.");
    }
    const product = input.productId ? await findActiveProductOrThrow(input.productId) : before.product;
    const finalInOrder = input.inOrder ?? before.inOrder;
    if (input.unitPriceCents !== undefined && input.unitPriceCents !== null && !finalInOrder) {
      throw new AppError("VALIDATION_ERROR", "Einen Preis gibt es nur fuer Wuensche in der Bestellliste.");
    }
    // Ausserhalb der Bestellliste gilt der Shop-Preis (null); in der Bestellliste wird er beim Aufnehmen, bei einem anderen
    // Produkt oder nach dem Leeren des Feldes mit dem aktuellen Shop-Preis eingefroren.
    let unitPriceCents: number | null | undefined = input.unitPriceCents;
    if (!finalInOrder) {
      unitPriceCents = null;
    } else if (input.unitPriceCents === undefined || input.unitPriceCents === null) {
      const changedProduct = product.id !== before.productId;
      unitPriceCents = changedProduct || input.unitPriceCents === null || before.unitPriceCents === null ? product.priceCents : undefined;
    }

    const updated = await prisma.sizzleWish.update({
      where: { id },
      data: omitUndefined({ ...input, unitPriceCents, updatedByUserId: user.id, updatedByName: user.username }),
      include: WISH_INCLUDE
    });
    await recordUpdate({ actor: actorFromRequest(req), area: "SIZZLE", entityId: id, description: describeWish(updated), before: snapshot(before), after: snapshot(updated) });
    sendData(res, toPublic(updated));
  })
);

// SCOPE: self
sizzleWishesRouter.delete(
  "/:id",
  ...requireSizzleAccess,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const user = getAuthenticatedUser(req);
    const before = await findWishOrThrow(id);
    if (user.role !== "ADMIN" && user.id !== before.addedByUserId) {
      throw new AppError("FORBIDDEN", "Nur wer den Wunsch hinzugefuegt hat oder ein Admin darf ihn loeschen.");
    }
    await prisma.sizzleWish.delete({ where: { id } });
    await recordAudit({ actor: actorFromRequest(req), action: "DELETE", area: "SIZZLE", entityId: id, description: describeWish(before), before: snapshot(before) });
    sendData(res, { deleted: true });
  })
);
