import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { filterSizzleGroups, groupSizzleProducts, sizzleProductTypes, NO_PRODUCT_TYPE_FILTER, type SizzleProduct } from "@filapilot/shared";
import { WISHLIST_INPUT_CLASS } from "./WishlistForm.js";
import { SizzleProductRow } from "./SizzleProductRow.js";

interface SizzleCatalogModalProps {
  products: readonly SizzleProduct[];
  syncedAt: Date | null;
  // Fehlermeldung, wenn der Katalog nicht geladen werden konnte
  error: string | null;
  refreshing: boolean;
  // Menge je Variante, die die angemeldete Person schon offen auf der Wunschliste hat
  mineByVariant: ReadonlyMap<string, number>;
  onAdd: (productId: string, quantity: number) => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
}

// Auswahl der Produkte des Shops als Dialog (bleibt offen, damit man mehrere Produkte nacheinander waehlen kann).
export function SizzleCatalogModal({ products, syncedAt, error, refreshing, mineByVariant, onAdd, onRefresh, onClose }: SizzleCatalogModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [productType, setProductType] = useState("");
  const groups = useMemo(() => groupSizzleProducts(products, i18n.language), [products, i18n.language]);
  const types = useMemo(() => sizzleProductTypes(groups, i18n.language), [groups, i18n.language]);
  const hasUntyped = groups.some((group) => group.productType === null);
  const visible = filterSizzleGroups(groups, { search, productType });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={t("sizzle.catalog.title")}>
      <div className="flex max-h-[92dvh] w-full max-w-[680px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t("sizzle.catalog.title")}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {syncedAt ? t("sizzle.catalog.syncedAt", { date: new Date(syncedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }) }) : t("sizzle.catalog.neverSynced")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: "var(--accent)" }}>
            {t("sizzle.catalog.done")}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("sizzle.catalog.search")}
            aria-label={t("sizzle.catalog.search")}
            className={`${WISHLIST_INPUT_CLASS} min-w-40 flex-1`}
          />
          <select value={productType} onChange={(event) => setProductType(event.target.value)} aria-label={t("sizzle.catalog.type")} className={WISHLIST_INPUT_CLASS}>
            <option value="">{t("sizzle.catalog.allTypes")}</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
            {hasUntyped && <option value={NO_PRODUCT_TYPE_FILTER}>{t("sizzle.catalog.noType")}</option>}
          </select>
          <button type="button" disabled={refreshing} onClick={onRefresh} className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-60">
            {refreshing ? t("sizzle.catalog.refreshing") : t("sizzle.catalog.refresh")}
          </button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
        {!error && products.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("sizzle.catalog.empty")}</p>}
        {products.length > 0 && visible.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("sizzle.catalog.noMatch")}</p>}

        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {visible.map((group) => (
            <SizzleProductRow key={group.key} group={group} mineByVariant={mineByVariant} onAdd={onAdd} />
          ))}
        </ul>
      </div>
    </div>
  );
}
