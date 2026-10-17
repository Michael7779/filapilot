import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildSettlementCsv,
  buildSettlementText,
  computeSettlement,
  type SettlementLabels,
  type WishlistItem,
  type WishlistOrderCost
} from "@filapilot/shared";
import { copyToClipboard } from "../lib/clipboard.js";
import { saveTextFile } from "../lib/download.js";
import { decimalSeparator, formatEuro } from "../lib/formatEuro.js";

interface WishlistSettlementViewProps {
  // Alle Eintraege (nicht nur die gefilterten): die Abrechnung gilt immer fuer die ganze Bestellliste
  items: readonly WishlistItem[];
  costs: readonly WishlistOrderCost[];
}

type CopyState = "idle" | "copied" | "failed";

// Abrechnung der Sammelbestellung: was schuldet jede Person (Ware + anteiliger Versand/Rabatt), dazu Export als CSV/Text.
export function WishlistSettlementView({ items, costs }: WishlistSettlementViewProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const locale = i18n.language;
  const settlement = computeSettlement(items, costs, locale);
  const euro = (cents: number): string => formatEuro(cents, locale);
  const noManufacturer = t("wishlist.order.noManufacturer");

  const labels: SettlementLabels = {
    person: t("wishlist.settlement.labels.person"),
    manufacturer: t("spools.manufacturer"),
    item: t("wishlist.settlement.labels.item"),
    quantity: t("wishlist.quantity"),
    unitPrice: t("wishlist.price.label"),
    amount: t("wishlist.settlement.labels.amount"),
    extras: t("wishlist.settlement.labels.extras"),
    total: t("wishlist.settlement.total"),
    noManufacturer,
    missingPrice: t("wishlist.settlement.labels.missingPrice")
  };

  async function copyText(): Promise<void> {
    const copied = await copyToClipboard(buildSettlementText(settlement, labels, decimalSeparator(locale)));
    setCopyState(copied ? "copied" : "failed");
  }

  if (settlement.persons.length === 0) {
    return <p className="text-sm text-[var(--color-text-secondary)]">{t("wishlist.settlement.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("wishlist.settlement.summary", { total: euro(settlement.totalCents), persons: settlement.persons.length })}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{t("wishlist.settlement.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => saveTextFile(t("wishlist.settlement.csvFilename"), buildSettlementCsv(settlement, labels), "text/csv")}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium"
          >
            {t("wishlist.settlement.csv")}
          </button>
          <button type="button" onClick={() => void copyText()} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium">
            {t("wishlist.settlement.copyText")}
          </button>
        </div>
      </div>
      {copyState !== "idle" && (
        <p role="status" className={`text-sm ${copyState === "failed" ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}`}>
          {copyState === "copied" ? t("wishlist.settlement.copied") : t("wishlist.settlement.copyFailed")}
        </p>
      )}
      {settlement.missingPriceCount > 0 && (
        <p role="alert" className="rounded-lg border border-[var(--color-danger)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {t("wishlist.settlement.missingPrices", { count: settlement.missingPriceCount })}
        </p>
      )}

      <section className="flex flex-col gap-2" aria-label={t("wishlist.settlement.byManufacturer")}>
        <h3 className="font-semibold">{t("wishlist.settlement.byManufacturer")}</h3>
        <ul className="flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-white p-3 text-sm">
          {settlement.manufacturers.map((group) => (
            <li key={group.manufacturerId ?? "none"} className="flex flex-wrap items-center justify-between gap-x-4">
              <span className="font-medium">{group.manufacturerName ?? noManufacturer}</span>
              <span className="tabular-nums text-[var(--color-text-secondary)]">
                {t("wishlist.settlement.groupLine", {
                  goods: euro(group.goodsCents),
                  shipping: euro(group.shippingCents),
                  discount: euro(group.discountCents),
                  total: euro(group.totalCents)
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-label={t("wishlist.settlement.byPerson")}>
        <h3 className="font-semibold">{t("wishlist.settlement.byPerson")}</h3>
        {settlement.persons.map((person) => (
          <article key={person.name} className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">{person.name}</h4>
              <span className="text-base font-bold tabular-nums">{euro(person.totalCents)}</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {person.lines.map((line) => (
                <li key={line.itemId} className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span>
                    <span className="tabular-nums">{line.quantity}x</span> {line.title}
                    {line.manufacturerName ? <span className="text-[var(--color-text-muted)]"> · {line.manufacturerName}</span> : null}
                  </span>
                  <span className="tabular-nums text-[var(--color-text-secondary)]">
                    {line.unitPriceCents === null ? (
                      <span className="text-[var(--color-danger)]">{labels.missingPrice}</span>
                    ) : (
                      `${euro(line.unitPriceCents)} → ${euro(line.lineCents)}`
                    )}
                  </span>
                </li>
              ))}
              {person.extras.map((extra) => (
                <li key={extra.manufacturerId ?? "none"} className="flex flex-wrap items-baseline justify-between gap-x-4 text-[var(--color-text-secondary)]">
                  <span>
                    {labels.extras} · {extra.manufacturerName ?? noManufacturer}
                  </span>
                  <span className="tabular-nums">{euro(extra.cents)}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
