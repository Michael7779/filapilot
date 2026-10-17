import { useState } from "react";
import { useTranslation } from "react-i18next";
import { groupWishlistByManufacturer, type WishlistItem, type WishlistStatus } from "@filapilot/shared";
import { WishlistItemRow } from "./WishlistItemRow.js";

export interface BulkPatch {
  status?: WishlistStatus;
  inOrder?: boolean;
}

interface WishlistOrderViewProps {
  // Schon gefilterte Eintraege (Suche/Filter der Seite)
  items: readonly WishlistItem[];
  canEdit: (item: WishlistItem) => boolean;
  onToggle: (item: WishlistItem, inOrder: boolean) => void;
  onBulk: (ids: string[], patch: BulkPatch) => void;
  onStatus: (item: WishlistItem, status: WishlistStatus) => void;
  onEdit: (item: WishlistItem) => void;
  onRemove: (item: WishlistItem) => void;
}

const GROUP_BUTTON_CLASS = "rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium disabled:opacity-40";

// Bestellliste der Sammelbestellung: alle Wuensche aller Nutzer, nach Hersteller gruppiert. Per Checkbox waehlt man aus,
// was wirklich bestellt wird; der Status ist derselbe wie in der Wunschliste (eine Aenderung gilt fuer beide Ansichten).
export function WishlistOrderView({ items, canEdit, onToggle, onBulk, onStatus, onEdit, onRemove }: WishlistOrderViewProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [onlySelected, setOnlySelected] = useState(false);

  const shown = onlySelected ? items.filter((item) => item.inOrder) : items;
  const groups = groupWishlistByManufacturer(shown, i18n.language);
  const selectedCount = shown.filter((item) => item.inOrder).length;
  const selectedQuantity = shown.reduce((sum, item) => sum + (item.inOrder ? item.quantity : 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("wishlist.order.summary", { positions: selectedCount, spools: selectedQuantity })}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{t("wishlist.order.hint")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <input type="checkbox" checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)} />
          {t("wishlist.order.onlySelected")}
        </label>
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">{onlySelected ? t("wishlist.order.noneSelected") : t("wishlist.empty")}</p>
      )}

      {groups.map((group) => {
        const selected = group.items.filter((item) => item.inOrder);
        const unselectedIds = group.items.filter((item) => !item.inOrder).map((item) => item.id);
        const toOrderIds = selected.filter((item) => item.status !== "ORDERED").map((item) => item.id);
        const toDoneIds = selected.filter((item) => item.status !== "DONE").map((item) => item.id);
        return (
          <section key={group.manufacturerId ?? "none"} className="flex flex-col gap-2" aria-label={group.manufacturerName ?? t("wishlist.order.noManufacturer")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">{group.manufacturerName ?? t("wishlist.order.noManufacturer")}</h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("wishlist.order.groupSummary", { selected: group.selectedCount, total: group.items.length, spools: group.selectedQuantity })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={unselectedIds.length === 0} onClick={() => onBulk(unselectedIds, { inOrder: true })} className={GROUP_BUTTON_CLASS}>
                  {t("wishlist.order.selectAll")}
                </button>
                <button type="button" disabled={selected.length === 0} onClick={() => onBulk(selected.map((item) => item.id), { inOrder: false })} className={GROUP_BUTTON_CLASS}>
                  {t("wishlist.order.selectNone")}
                </button>
                <button type="button" disabled={toOrderIds.length === 0} onClick={() => onBulk(toOrderIds, { status: "ORDERED" })} className={GROUP_BUTTON_CLASS}>
                  {t("wishlist.order.markOrdered")}
                </button>
                <button type="button" disabled={toDoneIds.length === 0} onClick={() => onBulk(toDoneIds, { status: "DONE" })} className={GROUP_BUTTON_CLASS}>
                  {t("wishlist.order.markDone")}
                </button>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {group.items.map((item) => (
                <WishlistItemRow
                  key={item.id}
                  item={item}
                  canEdit={canEdit(item)}
                  leading={
                    <input
                      type="checkbox"
                      checked={item.inOrder}
                      aria-label={t("wishlist.order.select", { title: item.title })}
                      onChange={(event) => onToggle(item, event.target.checked)}
                      className="h-4 w-4 shrink-0"
                    />
                  }
                  onStatus={onStatus}
                  onEdit={onEdit}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
