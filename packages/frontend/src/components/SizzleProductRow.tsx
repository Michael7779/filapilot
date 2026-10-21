import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SizzleProductGroup } from "@filapilot/shared";
import { formatEuro } from "../lib/formatEuro.js";
import { SizzleThumb } from "./SizzleThumb.js";

interface SizzleProductRowProps {
  group: SizzleProductGroup;
  // Menge, die die angemeldete Person von der jeweiligen Variante schon offen auf der Wunschliste hat (Variante -> Menge)
  mineByVariant: ReadonlyMap<string, number>;
  onAdd: (productId: string, quantity: number) => Promise<void>;
}

const MAX_QUANTITY = 999;

// Ein Produkt des Shops in der Auswahl: Bild, Titel, Varianten (z.B. 250 ml / 500 ml) als Auswahl mit Preis, Menge und Knopf.
export function SizzleProductRow({ group, mineByVariant, onAdd }: SizzleProductRowProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const firstAvailable = group.variants.find((variant) => variant.available) ?? group.variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const variant = group.variants.find((entry) => entry.id === variantId) ?? firstAvailable;
  const mine = variant ? (mineByVariant.get(variant.id) ?? 0) : 0;

  async function add(): Promise<void> {
    if (!variant) {
      return;
    }
    setBusy(true);
    try {
      await onAdd(variant.id, quantity);
      setQuantity(1);
    } finally {
      setBusy(false);
    }
  }

  if (!variant) {
    return <li />;
  }
  return (
    <li className="flex gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
      <SizzleThumb src={group.imageUrl} size="h-16 w-16" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <div className="font-medium">{group.title}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-text-muted)]">
            {group.productType && <span>{group.productType}</span>}
            <a href={variant.url} target="_blank" rel="noopener noreferrer" className="font-medium" style={{ color: "var(--accent)" }}>
              {t("sizzle.catalog.openInShop")}
            </a>
          </div>
        </div>
        {group.variants.length > 1 && (
          <div role="radiogroup" aria-label={t("sizzle.catalog.variant")} className="flex flex-wrap gap-1.5">
            {group.variants.map((entry) => {
              const selected = entry.id === variant.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setVariantId(entry.id)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${selected ? "text-white" : "text-[var(--color-text-secondary)]"} ${entry.available ? "" : "opacity-60"}`}
                  style={selected ? { backgroundColor: "var(--accent)", borderColor: "var(--accent)" } : { borderColor: "var(--color-border)" }}
                >
                  {entry.variantTitle} · {formatEuro(entry.priceCents, i18n.language)}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold tabular-nums">{formatEuro(variant.priceCents, i18n.language)}</span>
          {!variant.available && <span className="rounded-full bg-[var(--color-warning-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">{t("sizzle.catalog.soldOut")}</span>}
          <div className="flex items-center rounded-lg border border-[var(--color-border)]">
            <button type="button" aria-label={t("sizzle.catalog.less")} disabled={quantity <= 1} onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="px-2.5 py-1 text-base disabled:opacity-40">
              −
            </button>
            <span className="min-w-8 text-center text-sm tabular-nums" aria-live="polite" aria-label={t("sizzle.quantity")}>
              {quantity}
            </span>
            <button type="button" aria-label={t("sizzle.catalog.more")} disabled={quantity >= MAX_QUANTITY} onClick={() => setQuantity((current) => Math.min(MAX_QUANTITY, current + 1))} className="px-2.5 py-1 text-base disabled:opacity-40">
              +
            </button>
          </div>
          <button type="button" disabled={busy} onClick={() => void add()} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: "var(--accent)" }}>
            {t("sizzle.catalog.add")}
          </button>
        </div>
        {mine > 0 && (
          <div role="status" className="text-xs font-medium text-[var(--color-success)]">
            {t("sizzle.catalog.mine", { count: mine })}
          </div>
        )}
      </div>
    </li>
  );
}
