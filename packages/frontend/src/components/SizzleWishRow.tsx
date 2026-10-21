import { useTranslation } from "react-i18next";
import { sizzleProductLabel, sizzleWishPriceCents, type SizzleWish, type WishlistStatus } from "@filapilot/shared";
import { formatEuro } from "../lib/formatEuro.js";
import { STATUS_ORDER, STATUS_STYLE } from "../lib/wishlistStatus.js";
import { SizzleThumb } from "./SizzleThumb.js";
import { WISHLIST_INPUT_CLASS } from "./WishlistForm.js";

interface SizzleWishRowProps {
  wish: SizzleWish;
  canEdit: boolean;
  onStatus: (wish: SizzleWish, status: WishlistStatus) => void;
  onInOrder: (wish: SizzleWish, inOrder: boolean) => void;
  onEdit: (wish: SizzleWish) => void;
  onRemove: (wish: SizzleWish) => void;
}

function toStatus(value: string): WishlistStatus {
  return STATUS_ORDER.find((status) => status === value) ?? "OPEN";
}

// Eine Zeile der Wunschliste: Bild, Produkt, Menge, Preis (Shop-Preis, in der Bestellliste der dort gueltige) und Ersteller.
export function SizzleWishRow({ wish, canEdit, onStatus, onInOrder, onEdit, onRemove }: SizzleWishRowProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const unitCents = sizzleWishPriceCents(wish);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
      <SizzleThumb src={wish.product.imageUrl} />
      <div className="min-w-48 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            <span className="mr-1 tabular-nums">{wish.quantity}x</span>
            {sizzleProductLabel(wish.product)}
          </span>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: STATUS_STYLE[wish.status].bg, color: STATUS_STYLE[wish.status].fg }}>
            {t(`wishlist.status.${wish.status}`)}
          </span>
          {wish.inOrder && (
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              {t("sizzle.inOrder")}
            </span>
          )}
          {!wish.product.active && <span className="rounded-full bg-[var(--color-warning-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">{t("sizzle.notInShop")}</span>}
        </div>
        <div className="text-sm tabular-nums text-[var(--color-text-secondary)]">
          {t("sizzle.priceLine", { unit: formatEuro(unitCents, i18n.language), total: formatEuro(unitCents * wish.quantity, i18n.language) })}
          {wish.inOrder && wish.unitPriceCents !== null && wish.unitPriceCents !== wish.product.priceCents && (
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">{t("sizzle.shopPrice", { price: formatEuro(wish.product.priceCents, i18n.language) })}</span>
          )}
        </div>
        {wish.note && <div className="text-sm text-[var(--color-text-secondary)]">{wish.note}</div>}
        <div className="text-xs text-[var(--color-text-muted)]">
          {t("wishlist.addedBy", { name: wish.addedByName, date: new Date(wish.createdAt).toLocaleDateString(i18n.language) })}
          {wish.updatedByName && wish.updatedByName !== wish.addedByName ? ` · ${t("wishlist.updatedBy", { name: wish.updatedByName })}` : ""}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <input type="checkbox" checked={wish.inOrder} onChange={(event) => onInOrder(wish, event.target.checked)} className="h-4 w-4" />
        {t("sizzle.orderCheckbox")}
      </label>
      <select value={wish.status} aria-label={t("wishlist.statusLabel")} onChange={(event) => onStatus(wish, toStatus(event.target.value))} className={WISHLIST_INPUT_CLASS}>
        {STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {t(`wishlist.status.${status}`)}
          </option>
        ))}
      </select>
      {canEdit && (
        <div className="flex gap-2 text-xs font-medium">
          <button type="button" onClick={() => onEdit(wish)} style={{ color: "var(--accent)" }}>
            {t("common.edit")}
          </button>
          <button type="button" onClick={() => onRemove(wish)} className="text-[var(--color-danger)]">
            {t("common.delete")}
          </button>
        </div>
      )}
    </li>
  );
}
