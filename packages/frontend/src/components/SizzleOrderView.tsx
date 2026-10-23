import { useTranslation } from "react-i18next";
import { computeSizzleSettlement, groupSizzleOrderLines, sizzleProductLabel, type SizzleOrderCost, type SizzleOrderLine, type SizzleWish, type WishlistStatus } from "@filapilot/shared";
import { formatEuro } from "../lib/formatEuro.js";
import { STATUS_ORDER, STATUS_STYLE } from "../lib/wishlistStatus.js";
import { EuroField } from "./EuroField.js";
import { PercentField } from "./PercentField.js";
import { SizzleThumb } from "./SizzleThumb.js";
import { WISHLIST_INPUT_CLASS } from "./WishlistForm.js";

export interface SizzleBulkPatch {
  status?: WishlistStatus;
  inOrder?: boolean;
  unitPriceCents?: number | null;
}

interface SizzleOrderViewProps {
  wishes: readonly SizzleWish[];
  // Versand und Rabatt der ganzen Bestellung
  cost: SizzleOrderCost;
  onBulk: (ids: string[], patch: SizzleBulkPatch) => void;
  onCost: (cost: SizzleOrderCost) => void;
}

function toStatus(value: string): WishlistStatus | null {
  return STATUS_ORDER.find((status) => status === value) ?? null;
}

function OrderLine({ line, onBulk }: { line: SizzleOrderLine<SizzleWish>; onBulk: SizzleOrderViewProps["onBulk"] }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const ids = line.wishes.map((wish) => wish.id);
  const shopCents = line.product.priceCents;
  return (
    <li className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
      <SizzleThumb src={line.product.imageUrl} />
      <div className="min-w-48 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            <span className="mr-1 tabular-nums">{line.totalQuantity}x</span>
            {sizzleProductLabel(line.product)}
          </span>
          {line.status !== "MIXED" && (
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: STATUS_STYLE[line.status].bg, color: STATUS_STYLE[line.status].fg }}>
              {t(`wishlist.status.${line.status}`)}
            </span>
          )}
        </div>
        <ul className="mt-1 text-xs text-[var(--color-text-secondary)]">
          {line.contributors.map((person) => (
            <li key={person.name}>
              {person.name} · <span className="tabular-nums">{person.quantity}x</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <EuroField label={t("sizzle.order.price")} cents={line.priceCents} onCommit={(cents) => onBulk(ids, { unitPriceCents: cents })} />
          {line.priceCents !== null && (
            <span className="pb-1.5 text-sm font-medium tabular-nums">{t("sizzle.order.lineTotal", { quantity: line.totalQuantity, total: formatEuro(line.totalQuantity * line.priceCents, i18n.language) })}</span>
          )}
          {line.priceMixed && <span className="pb-1.5 text-xs text-[var(--color-danger)]">{t("wishlist.price.mixed")}</span>}
          {(line.priceMixed || line.priceCents !== shopCents) && (
            <button type="button" onClick={() => onBulk(ids, { unitPriceCents: shopCents })} className="pb-1.5 text-xs font-medium" style={{ color: "var(--accent)" }}>
              {t("sizzle.order.useShopPrice", { price: formatEuro(shopCents, i18n.language) })}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
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
        <button type="button" onClick={() => onBulk(ids, { inOrder: false })} className="text-xs font-medium text-[var(--color-danger)]">
          {t("sizzle.order.remove")}
        </button>
      </div>
    </li>
  );
}

// Die Bestellliste: die gewaehlten Wuensche aller Personen, je Produktvariante zusammengefasst. Der Preis hier (zunaechst der
// Shop-Preis, z.B. wegen eines Rabatts aenderbar) ist fuer die Abrechnung massgeblich.
export function SizzleOrderView({ wishes, cost, onBulk, onCost }: SizzleOrderViewProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const lines = groupSizzleOrderLines(wishes, i18n.language);
  if (lines.length === 0) {
    return <p className="text-sm text-[var(--color-text-secondary)]">{t("sizzle.order.empty")}</p>;
  }
  const settlement = computeSizzleSettlement(wishes, i18n.language, cost);
  const euro = (cents: number): string => formatEuro(cents, i18n.language);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">
          {t("sizzle.order.summary", { pieces: settlement.itemCount, goods: euro(settlement.goodsCents), shipping: euro(settlement.shippingCents), discount: euro(settlement.discountCents + settlement.percentDiscountCents), total: euro(settlement.totalCents) })}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">{t("sizzle.order.hint")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
        <EuroField label={t("sizzle.order.shipping")} cents={cost.shippingCents} onCommit={(cents) => onCost({ ...cost, shippingCents: cents ?? 0 })} />
        <PercentField label={t("sizzle.order.discountPercent")} basisPoints={cost.discountBp} onCommit={(basisPoints) => onCost({ ...cost, discountBp: basisPoints })} />
        <EuroField label={t("sizzle.order.discount")} cents={cost.discountCents} onCommit={(cents) => onCost({ ...cost, discountCents: cents ?? 0 })} />
        <p className="min-w-48 flex-1 pb-1.5 text-xs text-[var(--color-text-muted)]">{t("sizzle.order.costsHint")}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <OrderLine key={line.productId} line={line} onBulk={onBulk} />
        ))}
      </ul>
    </div>
  );
}
