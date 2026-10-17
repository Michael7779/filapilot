import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { WishlistItem, WishlistOrderLine, WishlistStatus } from "@filapilot/shared";
import { STATUS_ORDER, STATUS_STYLE } from "../lib/wishlistStatus.js";
import { ColorDot } from "./SpoolViews.js";
import { WISHLIST_INPUT_CLASS } from "./WishlistForm.js";
import { WishlistPriceField } from "./WishlistPriceField.js";
import type { BulkPatch } from "./WishlistOrderView.js";

interface WishlistOrderLineRowProps {
  line: WishlistOrderLine<WishlistItem>;
  canEdit: (item: WishlistItem) => boolean;
  suggestionCents: number | null;
  onBulk: (ids: string[], patch: BulkPatch) => void;
  onEdit: (item: WishlistItem) => void;
  onRemove: (item: WishlistItem) => void;
}

function toStatus(value: string): WishlistStatus | null {
  return STATUS_ORDER.find((status) => status === value) ?? null;
}

// Eine Position der Bestellliste: gleiche Wuensche mehrerer Personen (gleicher Hersteller, gleiches Material, gleiche
// Farbe) sind zusammengefasst. Auswahl, Status und Preis gelten fuer alle zugehoerigen Wuensche auf einmal.
export function WishlistOrderLineRow({ line, canEdit, suggestionCents, onBulk, onEdit, onRemove }: WishlistOrderLineRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const checkbox = useRef<HTMLInputElement>(null);
  const ids = line.items.map((item) => item.id);

  useEffect(() => {
    if (checkbox.current) {
      checkbox.current.indeterminate = line.selection === "some";
    }
  }, [line.selection]);

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
      <input
        ref={checkbox}
        type="checkbox"
        checked={line.selection === "all"}
        aria-label={t("wishlist.order.select", { title: line.title })}
        onChange={(event) => onBulk(ids, { inOrder: event.target.checked })}
        className="mt-1 h-4 w-4 shrink-0"
      />
      <div className="min-w-48 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            <span className="mr-1 tabular-nums">{line.totalQuantity}x</span>
            {line.title}
          </span>
          {line.status !== "MIXED" && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: STATUS_STYLE[line.status].bg, color: STATUS_STYLE[line.status].fg }}>
              {t(`wishlist.status.${line.status}`)}
            </span>
          )}
        </div>
        {(line.manufacturerName || line.materialName || line.colorName) && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            {line.colorHex && <ColorDot hex={line.colorHex} size="h-3 w-3" />}
            {[line.manufacturerName, line.materialName, line.colorName].filter(Boolean).join(" · ")}
          </div>
        )}
        <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--color-text-secondary)]">
          {line.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-2">
              <span>
                {item.addedByName} · <span className="tabular-nums">{item.quantity}x</span>
                {item.note ? ` · ${item.note}` : ""}
              </span>
              {canEdit(item) && (
                <span className="flex gap-2 font-medium">
                  <button type="button" onClick={() => onEdit(item)} style={{ color: "var(--accent)" }}>
                    {t("common.edit")}
                  </button>
                  <button type="button" onClick={() => onRemove(item)} className="text-[var(--color-danger)]">
                    {t("common.delete")}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {line.selection !== "none" && (
          <WishlistPriceField
            quantity={line.selectedQuantity}
            unitPriceCents={line.unitPriceCents}
            mixed={line.priceMixed}
            suggestionCents={suggestionCents}
            onChange={(cents) => onBulk(ids, { unitPriceCents: cents })}
          />
        )}
      </div>
      <select
        value={line.status}
        aria-label={t("wishlist.statusLabel")}
        onChange={(event) => {
          const status = toStatus(event.target.value);
          if (status) {
            onBulk(ids, { status });
          }
        }}
        className={WISHLIST_INPUT_CLASS}
      >
        {line.status === "MIXED" && (
          <option value="MIXED" disabled>
            {t("wishlist.order.statusMixed")}
          </option>
        )}
        {STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {t(`wishlist.status.${status}`)}
          </option>
        ))}
      </select>
    </li>
  );
}
