import type { Prisma, User } from "@prisma/client";
import type { BulkUpdateSizzleWishesInput } from "@filapilot/shared";
import { prisma } from "../prisma.js";
import { omitUndefined } from "../lib/omitUndefined.js";

// Beim Aufnehmen in die Bestellliste wird der Preis mit dem aktuellen Shop-Preis eingefroren: ab dann ist er auf der
// Bestellliste aenderbar (Rabatt) und fuer die Abrechnung massgeblich, auch wenn der Shop-Preis sich spaeter aendert.
// Gruppiert nach Preis, damit es je Preis eine Abfrage gibt statt je Wunsch eine.
async function freezePrices(tx: Prisma.TransactionClient, ids: readonly string[]): Promise<void> {
  const unpriced = await tx.sizzleWish.findMany({
    where: { id: { in: [...ids] }, inOrder: true, unitPriceCents: null },
    select: { id: true, product: { select: { priceCents: true } } }
  });
  const idsByPrice = new Map<number, string[]>();
  for (const wish of unpriced) {
    idsByPrice.set(wish.product.priceCents, [...(idsByPrice.get(wish.product.priceCents) ?? []), wish.id]);
  }
  for (const [priceCents, priceIds] of idsByPrice) {
    await tx.sizzleWish.updateMany({ where: { id: { in: priceIds } }, data: { unitPriceCents: priceCents } });
  }
}

// Status, Auswahl (inOrder) und Preis fuer mehrere Wuensche auf einmal. Der Preis gilt nur fuer Wuensche der Bestellliste:
// beim Entfernen aus der Bestellliste faellt er auf den Shop-Preis zurueck (null), ein Preis fuer Wuensche ausserhalb wird
// ignoriert. Liefert die Anzahl der gefundenen Wuensche (unbekannte IDs zaehlen nicht).
export async function bulkUpdateWishes(input: BulkUpdateSizzleWishesInput, user: Pick<User, "id" | "username">): Promise<number> {
  const ids = input.ids;
  return prisma.$transaction(async (tx) => {
    const result = await tx.sizzleWish.updateMany({
      where: { id: { in: ids } },
      data: omitUndefined({
        status: input.status,
        inOrder: input.inOrder,
        unitPriceCents: input.inOrder === false ? null : undefined,
        updatedByUserId: user.id,
        updatedByName: user.username
      })
    });
    if (input.inOrder !== false) {
      if (input.unitPriceCents !== undefined) {
        await tx.sizzleWish.updateMany({ where: { id: { in: ids }, inOrder: true }, data: { unitPriceCents: input.unitPriceCents } });
      }
      // Neu in der Bestellliste oder Preis geleert (= zurueck auf den Shop-Preis): mit dem aktuellen Shop-Preis einfrieren
      if (input.inOrder === true || input.unitPriceCents === null) {
        await freezePrices(tx, ids);
      }
    }
    return result.count;
  });
}
