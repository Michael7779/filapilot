import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buildSizzleSettlementCsv, buildSizzleSettlementText, computeSizzleSettlement, type SizzleOrderCost, type SizzleSettlementLabels, type SizzleWish } from "@filapilot/shared";
import { copyToClipboard } from "../lib/clipboard.js";
import { saveTextFile } from "../lib/download.js";
import { decimalSeparator, formatEuro } from "../lib/formatEuro.js";

interface SizzleSettlementViewProps {
  wishes: readonly SizzleWish[];
  cost: SizzleOrderCost;
}

type CopyState = "idle" | "copied" | "failed";

// Abrechnung: was schuldet jede Person (Menge mal Preis der Bestellliste), dazu Export als CSV/Text.
export function SizzleSettlementView({ wishes, cost }: SizzleSettlementViewProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const locale = i18n.language;
  const settlement = computeSizzleSettlement(wishes, locale, cost);
  const euro = (cents: number): string => formatEuro(cents, locale);
  const labels: SizzleSettlementLabels = {
    person: t("wishlist.settlement.labels.person"),
    item: t("sizzle.settlement.item"),
    quantity: t("sizzle.quantity"),
    unitPrice: t("sizzle.order.price"),
    amount: t("wishlist.settlement.labels.amount"),
    extras: t("sizzle.settlement.extras"),
    total: t("wishlist.settlement.total")
  };

  async function copyText(): Promise<void> {
    const copied = await copyToClipboard(buildSizzleSettlementText(settlement, labels, decimalSeparator(locale)));
    setCopyState(copied ? "copied" : "failed");
  }

  if (settlement.persons.length === 0) {
    return <p className="text-sm text-[var(--color-text-secondary)]">{t("sizzle.settlement.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("sizzle.settlement.summary", { total: euro(settlement.totalCents), persons: settlement.persons.length, pieces: settlement.itemCount })}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{t("sizzle.settlement.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => saveTextFile(t("sizzle.settlement.csvFilename"), buildSizzleSettlementCsv(settlement, labels), "text/csv")}
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
      <p className="rounded-xl border border-[var(--color-border)] bg-white p-3 text-sm tabular-nums text-[var(--color-text-secondary)]">
        {t("sizzle.settlement.breakdown", { goods: euro(settlement.goodsCents), shipping: euro(settlement.shippingCents), discount: euro(settlement.discountCents), total: euro(settlement.totalCents) })}
      </p>
      <section className="flex flex-col gap-3" aria-label={t("wishlist.settlement.byPerson")}>
        {settlement.persons.map((person) => (
          <article key={person.name} className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{person.name}</h3>
              <span className="text-base font-bold tabular-nums">{euro(person.totalCents)}</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {person.lines.map((line) => (
                <li key={line.wishId} className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span>
                    <span className="tabular-nums">{line.quantity}x</span> {line.title}
                  </span>
                  <span className="tabular-nums text-[var(--color-text-secondary)]">
                    {euro(line.unitPriceCents)} → {euro(line.lineCents)}
                  </span>
                </li>
              ))}
              {person.extrasCents !== 0 && (
                <li className="flex flex-wrap items-baseline justify-between gap-x-4 text-[var(--color-text-secondary)]">
                  <span>{t("sizzle.settlement.extras")}</span>
                  <span className="tabular-nums">{euro(person.extrasCents)}</span>
                </li>
              )}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
