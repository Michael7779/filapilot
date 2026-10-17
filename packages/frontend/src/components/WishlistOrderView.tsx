import { useState } from "react";
import { useTranslation } from "react-i18next";
import { groupWishlistByManufacturer, type Material, type WishlistItem, type WishlistOrderCost, type WishlistStatus } from "@filapilot/shared";
import { WishlistGroupCosts } from "./WishlistGroupCosts.js";
import { WishlistOrderLineRow } from "./WishlistOrderLineRow.js";

export interface BulkPatch {
  status?: WishlistStatus;
  inOrder?: boolean;
  unitPriceCents?: number | null;
}

interface WishlistOrderViewProps {
  // Schon gefilterte Eintraege (Suche/Filter der Seite)
  items: readonly WishlistItem[];
  costs: readonly WishlistOrderCost[];
  materials: readonly Material[];
  canEdit: (item: WishlistItem) => boolean;
  onBulk: (ids: string[], patch: BulkPatch) => void;
  onCosts: (manufacturerId: string, shippingCents: number, discountCents: number) => void;
  onEdit: (item: WishlistItem) => void;
  onRemove: (item: WishlistItem) => void;
}

const GROUP_BUTTON_CLASS = "rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium disabled:opacity-40";

// Bestellliste der Sammelbestellung: alle Wuensche aller Nutzer, nach Hersteller gruppiert, gleiche Wuensche zu einer
// Position zusammengefasst. Per Checkbox waehlt man aus, was wirklich bestellt wird; der Status ist derselbe wie in der
// Wunschliste (eine Aenderung gilt fuer beide Ansichten).
export function WishlistOrderView({ items, costs, materials, canEdit, onBulk, onCosts, onEdit, onRemove }: WishlistOrderViewProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [onlySelected, setOnlySelected] = useState(false);

  const shown = onlySelected ? items.filter((item) => item.inOrder) : items;
  const groups = groupWishlistByManufacturer(shown, i18n.language);
  const lines = groups.flatMap((group) => group.lines);
  const selectedPositions = lines.filter((line) => line.selection !== "none").length;
  const selectedQuantity = groups.reduce((sum, group) => sum + group.selectedQuantity, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("wishlist.order.summary", { positions: selectedPositions, spools: selectedQuantity })}</p>
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
        const selectedLines = group.lines.filter((line) => line.selection !== "none").length;
        return (
          <section key={group.manufacturerId ?? "none"} className="flex flex-col gap-2" aria-label={group.manufacturerName ?? t("wishlist.order.noManufacturer")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">{group.manufacturerName ?? t("wishlist.order.noManufacturer")}</h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("wishlist.order.groupSummary", { selected: selectedLines, total: group.lines.length, spools: group.selectedQuantity })}
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
            {group.manufacturerId && group.selectedCount > 0 && (
              <WishlistGroupCosts
                cost={costs.find((entry) => entry.manufacturerId === group.manufacturerId)}
                onSave={(shipping, discount) => onCosts(group.manufacturerId ?? "", shipping, discount)}
              />
            )}
            <ul className="flex flex-col gap-2">
              {group.lines.map((line) => (
                <WishlistOrderLineRow
                  key={line.key}
                  line={line}
                  canEdit={canEdit}
                  suggestionCents={materials.find((material) => material.id === line.items[0]?.materialId)?.priceWithSpoolCents ?? null}
                  onBulk={onBulk}
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
