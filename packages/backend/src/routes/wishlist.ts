import { Router } from "express";
import { z } from "zod";
import { CONTENT_FIELDS, createWishlistItemInputSchema, updateWishlistItemInputSchema, type WishlistItem } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendData, AppError } from "../lib/apiResult.js";
import { getAuthenticatedUser, requireAuth, requirePasswordAlreadyChanged } from "../middleware/auth.js";
import { omitUndefined } from "../lib/omitUndefined.js";
import { actorFromRequest, recordAudit, recordUpdate } from "../services/auditService.js";

export const wishlistRouter = Router();

const requireActiveUser = [requireAuth, requirePasswordAlreadyChanged] as const;
const idParamSchema = z.string().uuid();

interface WishlistRow {
  id: string;
  title: string;
  note: string | null;
  quantity: number;
  status: string;
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

async function findItemOrThrow(id: string): Promise<WishlistRow> {
  const item = await prisma.wishlistItem.findUnique({ where: { id } });
  if (!item) {
    throw new AppError("NOT_FOUND", "Eintrag wurde nicht gefunden.");
  }
  return item;
}

// Threat-Model: Ein anderer Nutzer koennte versuchen, Titel/Notiz/Menge eines fremden Wunsches zu veraendern oder
// ihn zu loeschen (die Liste ist absichtlich instanzweit, jeder eingeloggte Nutzer sieht und ergaenzt sie fuer eine
// Sammelbestellung). Serverseitig erzwungen: Lesen/Anlegen fuer jeden aktiven Nutzer; Inhalt (Titel/Notiz/Menge)
// aendern oder loeschen nur der Ersteller oder ein Admin (403 sonst); den Status (offen/bestellt/erledigt) darf
// bewusst jeder aktive Nutzer setzen, damit alle an der Sammelbestellung mitwirken koennen.
// Negativ-Tests: kein Cookie -> 401, fremder Inhalt aendern/loeschen -> 403, fremden Status setzen -> 200 (erlaubt).
// SCOPE: user
wishlistRouter.get(
  "/",
  ...requireActiveUser,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.wishlistItem.findMany({ orderBy: [{ status: "asc" }, { createdAt: "asc" }], take: 500 });
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
    const user = getAuthenticatedUser(req);
    const created = await prisma.wishlistItem.create({
      data: { ...input, addedByUserId: user.id, addedByName: user.username }
    });
    await recordAudit({
      actor: actorFromRequest(req),
      action: "CREATE",
      area: "WISHLIST",
      entityId: created.id,
      description: describeItem(created),
      after: { title: created.title, note: created.note, quantity: created.quantity }
    });
    sendData(res, toPublic(created), 201);
  })
);

// SCOPE: self (Inhalt) bzw. user (Status)
wishlistRouter.patch(
  "/:id",
  ...requireActiveUser,
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = updateWishlistItemInputSchema.parse(req.body);
    const user = getAuthenticatedUser(req);
    const before = await findItemOrThrow(id);

    const touchesContent = CONTENT_FIELDS.some((field) => input[field] !== undefined);
    if (touchesContent && user.role !== "ADMIN" && user.id !== before.addedByUserId) {
      throw new AppError("FORBIDDEN", "Nur wer den Wunsch hinzugefuegt hat oder ein Admin darf ihn aendern.");
    }

    const updated = await prisma.wishlistItem.update({
      where: { id },
      data: omitUndefined({ ...input, updatedByUserId: user.id, updatedByName: user.username })
    });
    await recordUpdate({
      actor: actorFromRequest(req),
      area: "WISHLIST",
      entityId: id,
      description: describeItem(updated),
      before: { title: before.title, note: before.note, quantity: before.quantity, status: before.status },
      after: { title: updated.title, note: updated.note, quantity: updated.quantity, status: updated.status }
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
      before: { title: before.title, note: before.note, quantity: before.quantity }
    });
    sendData(res, { deleted: true });
  })
);
