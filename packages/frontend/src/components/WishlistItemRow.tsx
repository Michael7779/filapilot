import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { WishlistItem, WishlistStatus } from "@filapilot/shared";
import { STATUS_ORDER, STATUS_STYLE } from "../lib/wishlistStatus.js";
import { ColorDot } from "./SpoolViews.js";
import { WISHLIST_INPUT_CLASS } from "./WishlistForm.js";

interface WishlistItemRowProps {
  item: WishlistItem;
  canEdit: boolean;
  // Optionales Element vor dem Inhalt, z.B. die Auswahl-Checkbox der Bestellliste
  leading?: ReactNode;
  // Zeigt in der Wunschliste, dass der Eintrag zur Bestellliste gehoert
  showInOrderBadge?: boolean;
  // Zusatz unter den Angaben, z.B. das Preisfeld der Bestellliste
  extra?: ReactNode;
  onStatus: (item: WishlistItem, status: WishlistStatus) => void;
  onEdit: (item: WishlistItem) => void;
  onRemove: (item: WishlistItem) => void;
}

function toStatus(value: string): WishlistStatus {
  return STATUS_ORDER.find((status) => status === value) ?? "OPEN";
}

// Eine Zeile der Wunsch- bzw. Bestellliste; beide Ansichten zeigen denselben Eintrag und denselben Status.
export function WishlistItemRow({ item, canEdit, leading, showInOrderBadge, extra, onStatus, onEdit, onRemove }: WishlistItemRowProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
      {leading}
      <div className="min-w-48 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            <span className="mr-1 tabular-nums">{item.quantity}x</span>
            {item.title}
          </span>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: STATUS_STYLE[item.status].bg, color: STATUS_STYLE[item.status].fg }}>
            {t(`wishlist.status.${item.status}`)}
          </span>
          {showInOrderBadge && item.inOrder && (
            <span className="rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              {t("wishlist.inOrder")}
            </span>
          )}
        </div>
        {(item.manufacturerName || item.materialName || item.colorName) && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            {item.colorHex && <ColorDot hex={item.colorHex} size="h-3 w-3" />}
            {[item.manufacturerName, item.materialName, item.colorName].filter(Boolean).join(" · ")}
          </div>
        )}
        {item.note && <div className="text-sm text-[var(--color-text-secondary)]">{item.note}</div>}
        <div className="text-xs text-[var(--color-text-muted)]">
          {t("wishlist.addedBy", { name: item.addedByName, date: new Date(item.createdAt).toLocaleDateString(i18n.language) })}
          {item.updatedByName && item.updatedByName !== item.addedByName ? ` · ${t("wishlist.updatedBy", { name: item.updatedByName })}` : ""}
        </div>
        {extra}
      </div>
      <select
        value={item.status}
        aria-label={t("wishlist.statusLabel")}
        onChange={(event) => onStatus(item, toStatus(event.target.value))}
        className={WISHLIST_INPUT_CLASS}
      >
        {STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {t(`wishlist.status.${status}`)}
          </option>
        ))}
      </select>
      {canEdit && (
        <div className="flex gap-2 text-xs font-medium">
          <button type="button" onClick={() => onEdit(item)} style={{ color: "var(--accent)" }}>
            {t("common.edit")}
          </button>
          <button type="button" onClick={() => onRemove(item)} className="text-[var(--color-danger)]">
            {t("common.delete")}
          </button>
        </div>
      )}
    </li>
  );
}
