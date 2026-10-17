import { useTranslation } from "react-i18next";
import type { WishlistOrderCost } from "@filapilot/shared";
import { EuroField } from "./EuroField.js";

interface WishlistGroupCostsProps {
  cost: WishlistOrderCost | undefined;
  onSave: (shippingCents: number, discountCents: number) => void;
}

// Versand und Rabatt eines Herstellers; die Abrechnung verteilt beides nach Warenwert auf die Personen.
export function WishlistGroupCosts({ cost, onSave }: WishlistGroupCostsProps): React.JSX.Element {
  const { t } = useTranslation();
  const shipping = cost?.shippingCents ?? 0;
  const discount = cost?.discountCents ?? 0;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-[var(--color-border)] p-3">
      <EuroField label={t("wishlist.costs.shipping")} cents={shipping} onCommit={(value) => onSave(value ?? 0, discount)} />
      <EuroField label={t("wishlist.costs.discount")} cents={discount} onCommit={(value) => onSave(shipping, value ?? 0)} />
      <p className="pb-1.5 text-xs text-[var(--color-text-muted)]">{t("wishlist.costs.hint")}</p>
    </div>
  );
}
