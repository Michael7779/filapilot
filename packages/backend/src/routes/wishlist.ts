import { Router } from "express";
import { z } from "zod";
import {
  CONTENT_FIELDS,
  bulkUpdateWishlistInputSchema,
  createWishlistItemInputSchema,
  setWishlistOrderCostInputSchema,
  updateWishlistItemInputSchema,
  type WishlistItem,
  type WishlistOrderCost
} from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";

export const wishlistRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const idParamSchema = z.string().uuid();
const WISHLIST_INCLUDE = { manufacturer: { select: { name: true } }, material: { select: { name: true } } } as const;

interface WishlistRow {
  id: string;
  title: string;
  note: string | null;
  quantity: number;
  status: string;
  inOrder: boolean;
  unitPriceCents: number | null;
  manufacturerId: string | null;
  manufacturer: { name: string } | null;
  materialId: string | null;
  material: { name: string } | null;
  colorName: string | null;
  colorHex: string | null;
  addedByUserId: string | null;
  addedByName: string;
  createdAt: Date;
  updatedByName: string | null;
  updatedAt: Date;
}

function toPublic(row: WishlistRow): WishlistItem {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    quantity: row.quantity,
    status: row.status as WishlistItem["status"],
    inOrder: row.inOrder,
    unitPriceCents: row.unitPriceCents,
    manufacturerId: row.manufacturerId,
    manufacturerName: row.manufacturer?.name ?? null,
    materialId: row.materialId,
    materialName: row.material?.name ?? null,
    colorName: row.colorName,
    colorHex: row.colorHex,
    addedByUserId: row.addedByUserId,
    addedByName: row.addedByName,
    createdAt: row.createdAt,
    updatedByName: row.updatedByName,
    updatedAt: row.updatedAt
  };
}

function describeItem(row: { title: string; quantity: number }): string {
  return row.quantity > 1 ? `${row.quantity}x ${row.title}` : row.title;
}

function contentSnapshot(row: WishlistRow): Record<string, unknown> {
  return {
    title: row.title,
    note: row.note,
    quantity: row.quantity,
    status: row.status,
    inOrder: row.inOrder,
    unitPriceCents: row.unitPriceCents,
    manufacturerName: row.manufacturer?.name ?? null,
    materialName: row.material?.name ?? null,
    colorName: row.colorName
  };
}

async function findItemOrThrow(id: string): Promise<WishlistRow> {
  const item = await prisma.wishlistItem.findUnique({ where: { id }, include: WISHLIST_INCLUDE });
  if (!item) {
    throw new AppError("NOT_FOUND", "Eintrag wurde nicht gefunden.");
  }
  return item;
}

// Ein Verweis auf Hersteller/Material ist rein informativ (Hinweis, kein Zwang wie bei einer echten Spule) -
// er muss aber tatsaechlich existieren, sonst koennte die Anzeige spaeter ins Leere zeigen.
async function assertCatalogRefsExist(manufacturerId?: string | null, materialId?: string | null): Promise<void> {
  if (manufacturerId) {
    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
    if (!manufacturer) {
      throw new AppError("VALIDATION_ERROR", "Unbekannter Hersteller.");
    }
  }
  if (materialId) {
    const material = await prisma.material.findUnique({ where: { id: materialId } });
    if (!material) {
      throw new AppError("VALIDATION_ERROR", "Unbekanntes Material.");
    }
  }
}

// Threat-Model: Ein anderer Nutzer koennte versuchen, Titel/Notiz/Menge eines fremden Wunsches zu veraendern oder
// ihn zu loeschen (die Liste ist absichtlich instanzweit, jeder eingeloggte Nutzer sieht und ergaenzt sie fuer eine
// Sammelbestellung). Serverseitig erzwungen: Lesen/Anlegen fuer jeden aktiven Nutzer; Inhalt (Titel/Notiz/Menge/
// Hersteller-Material-Verweis/Farbe) aendern oder loeschen nur der Ersteller oder ein Admin (403 sonst); den Status
// (offen/bestellt/erledigt) darf bewusst jeder aktive Nutzer setzen, damit alle an der Sammelbestellung mitwirken
// koennen; ein mitgeschickter Hersteller/Material-Verweis wird gegen die Stammdaten geprueft (400 bei unbekannt).
// Negativ-Tests: kein Cookie -> 401, fremder Inhalt aendern/loeschen -> 403, fremden Status setzen -> 200 (erlaubt).
// SCOPE: user
wishlistRouter.get(
  "/",
  ...requireActiveUser,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.wishlistItem.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 500,
      include: WISHLIST_INCLUDE
    });
    sendData(res, rows.map(toPublic));
  })
);

// Aufraeumen: entfernt alle erledigten Eintraege auf einmal (OP-W1) - die Liste waechst sonst unbegrenzt. Wie beim
// Setzen des Status darf das jeder aktive Nutzer, nicht nur der/die Ersteller:in der einzelnen Eintraege.
// SCOPE: user
wishlistRouter.delete(
  "/done",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const done = await prisma.wishlistItem.findMany({ where: { status: "DONE" }, select: { id: true } });
    if (done.length === 0) {
      sendData(res, { deleted: 0 });
      return;
    }
    await prisma.wishlistItem.deleteMany({ where: { status: "DONE" } });
    // Nebenkosten (Versand/Rabatt) gehoeren zu einer laufenden Sammelbestellung: ist fuer einen Hersteller nichts mehr auf
    // der Liste, verschwinden sie mit, damit sie nicht in die naechste Bestellung rutschen.
    await prisma.wishlistOrderCost.deleteMany({ where: { manufacturer: { wishlistItems: { none: {} } } } });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "WISHLIST",
      description: `${done.length} erledigte Eintraege entfernt`
    });
    sendData(res, { deleted: done.length });
  })
);

// SCOPE: user
wishlistRouter.post(
  "/",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const input = createWishlistItemInputSchema.parse(req.body);
    await assertCatalogRefsExist(input.manufacturerId, input.materialId);
    const user = getAuthenticatedUser(req);
    const created = await prisma.wishlistItem.create({
      data: { ...input, addedByUserId: user.id, addedByName: user.username },
      include: WISHLIST_INCLUDE
    });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "CREATE",
      area: "WISHLIST",
      entityId: created.id,
      description: describeItem(created),
      after: contentSnapshot(created)
    });
    sendData(res, toPublic(created), 201);
  })
);

// Nebenkosten je Hersteller fuer die Abrechnung der Sammelbestellung. Threat-Model: anonym -> 401; wie Status/Auswahl darf
// jeder aktive Nutzer sie setzen (gemeinsame Sammelbestellung, Aenderungen stehen im Protokoll). Serverseitig erzwungen:
// nur ganze Cent-Betraege 0..1.000.000 und ausschliesslich shippingCents/discountCents (strict, sonst 400), ein
// unbekannter Hersteller ergibt 404. Negativ-Tests: tests/security/wishlist.test.ts.
// SCOPE: user
wishlistRouter.get(
  "/costs",
  ...requireActiveUser,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.wishlistOrderCost.findMany({ select: { manufacturerId: true, shippingCents: true, discountCents: true } });
    sendData(res, rows satisfies WishlistOrderCost[]);
  })
);

// SCOPE: user
wishlistRouter.put(
  "/costs/:manufacturerId",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const manufacturerId = idParamSchema.parse(req.params.manufacturerId);
    const input = setWishlistOrderCostInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId }, select: { name: true } });
    if (!manufacturer) {
      throw new AppError("NOT_FOUND", "Hersteller wurde nicht gefunden.");
    }
    const saved = await prisma.wishlistOrderCost.upsert({
      where: { manufacturerId },
      create: { manufacturerId, ...input, updatedByName: user.username },
      update: { ...input, updatedByName: user.username },
      select: { manufacturerId: true, shippingCents: true, discountCents: true }
    });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "EVENT",
      area: "WISHLIST",
      entityId: manufacturerId,
      description: `Nebenkosten ${manufacturer.name}: Versand ${(saved.shippingCents / 100).toFixed(2)} EUR, Rabatt ${(saved.discountCents / 100).toFixed(2)} EUR`
    });
    sendData(res, saved satisfies WishlistOrderCost);
  })
);

// Bestellliste: Auswahl (inOrder) und/oder Status fuer mehrere Wuensche auf einmal setzen. Threat-Model: anonym -> 401;
// eingeloggte Nutzer duerfen Auswahl und Status wie bei der Einzel-Route auch bei fremden Wuenschen setzen (gemeinsame
// Sammelbestellung), aber NIE Inhalt - das Schema ist strict(), Titel/Menge/... werden mit 400 abgelehnt, und die IDs sind
// auf 500 begrenzt. Negativ-Tests: tests/security/wishlist.test.ts (401, 400 bei Inhaltsfeldern/leerer/zu langer Liste).
// Muss vor "/:id" stehen, sonst wuerde "bulk" als ID gelesen.
// SCOPE: user
wishlistRouter.patch(
  "/bulk",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const input = bulkUpdateWishlistInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    const result = await prisma.wishlistItem.updateMany({
      where: { id: { in: input.ids } },
      data: omitUndefined({
        status: input.status,
        inOrder: input.inOrder,
        unitPriceCents: input.unitPriceCents,
        updatedByUserId: user.id,
        updatedByName: user.username
      })
    });
    if (result.count > 0) {
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
      await recordAudit({
        actor: actorFromRequest(req),
        action: "EVENT",
        area: "WISHLIST",
        description: `${result.count} Eintraege geaendert (${changes.join(", ")})`
      });
    }
    sendData(res, { updated: result.count });
  })
);

// SCOPE: self (Inhalt) bzw. user (Status und Bestellliste-Auswahl)
wishlistRouter.patch(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = updateWishlistItemInputSchema.parse(req.body);
    await assertCatalogRefsExist(input.manufacturerId, input.materialId);
    const user = getAuthenticatedUser(req);
    const before = await findItemOrThrow(id);

    const touchesContent = CONTENT_FIELDS.some((field) => input[field] !== undefined);
    if (touchesContent && user.role !== "ADMIN" && user.id !== before.addedByUserId) {
      throw new AppError("FORBIDDEN", "Nur wer den Wunsch hinzugefuegt hat oder ein Admin darf ihn aendern.");
    }

    const updated = await prisma.wishlistItem.update({
      where: { id },
      data: omitUndefined({ ...input, updatedByUserId: user.id, updatedByName: user.username }),
      include: WISHLIST_INCLUDE
    });
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "WISHLIST",
      entityId: id,
      description: describeItem(updated),
      before: contentSnapshot(before),
      after: contentSnapshot(updated)
    });
    sendData(res, toPublic(updated));
  })
);

// SCOPE: self
wishlistRouter.delete(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const user = getAuthenticatedUser(req);
    const before = await findItemOrThrow(id);
    if (user.role !== "ADMIN" && user.id !== before.addedByUserId) {
      throw new AppError("FORBIDDEN", "Nur wer den Wunsch hinzugefuegt hat oder ein Admin darf ihn loeschen.");
    }
    await prisma.wishlistItem.delete({ where: { id } });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "DELETE",
      area: "WISHLIST",
      entityId: id,
      description: describeItem(before),
      before: contentSnapshot(before)
    });
    sendData(res, { deleted: true });
  })
);
