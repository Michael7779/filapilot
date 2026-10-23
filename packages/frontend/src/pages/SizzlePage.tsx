import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { sizzleProductLabel, type SizzleCatalog, type SizzleOrderCost, type SizzleWish, type WishlistStatus } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { STATUS_ORDER } from "../lib/wishlistStatus.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { useAuthStore } from "../stores/useAuthStore.js";
import { useSizzleRefresh } from "../hooks/useSizzleRefresh.js";
import { SizzleCatalogModal } from "../components/SizzleCatalogModal.js";
import { SizzleRefreshCard } from "../components/SizzleRefreshCard.js";
import { SizzleRefreshChip } from "../components/SizzleRefreshChip.js";
import { SizzleOrderView, type SizzleBulkPatch } from "../components/SizzleOrderView.js";
import { SizzleSettlementView } from "../components/SizzleSettlementView.js";
import { SizzleWishEditModal } from "../components/SizzleWishEditModal.js";
import { SizzleWishRow } from "../components/SizzleWishRow.js";
import { WISHLIST_INPUT_CLASS } from "../components/WishlistForm.js";

type SizzleTab = "list" | "order" | "settlement";

interface WishFilter {
  search: string;
  status: WishlistStatus | "";
  addedBy: string;
}

const EMPTY_FILTER: WishFilter = { search: "", status: "", addedBy: "" };

function matchesFilter(wish: SizzleWish, filter: WishFilter): boolean {
  if ((filter.status !== "" && wish.status !== filter.status) || (filter.addedBy !== "" && wish.addedByName !== filter.addedBy)) {
    return false;
  }
  const text = [sizzleProductLabel(wish.product), wish.product.productType, wish.note, wish.addedByName].filter(Boolean).join(" ").toLowerCase();
  return filter.search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

// SizzleBrothers-Sammelbestellung: Wunschliste (alle sehen, wer was moechte), Bestellliste (gewaehlte Produkte mit aenderbarem
// Preis, z.B. wegen eines Rabatts) und Abrechnung je Person. Die Produkte samt Bild und Preis kommen aus dem Shop.
export function SizzlePage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [wishes, setWishes] = useState<SizzleWish[] | null>(null);
  const [cost, setCost] = useState<SizzleOrderCost>({ shippingCents: 0, discountCents: 0, discountBp: 0 });
  const [catalog, setCatalog] = useState<SizzleCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SizzleTab>("list");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<SizzleWish | null>(null);
  const [filter, setFilter] = useState<WishFilter>(EMPTY_FILTER);

  const loadWishes = useCallback(async (): Promise<void> => {
    try {
      const [loadedWishes, loadedCost] = await Promise.all([apiRequest<SizzleWish[]>("/sizzle/wishes"), apiRequest<SizzleOrderCost>("/sizzle/costs")]);
      setWishes(loadedWishes);
      setCost(loadedCost);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("sizzle.loadFailed"));
    }
  }, [t]);

  const loadCatalog = useCallback(async (): Promise<void> => {
    try {
      setCatalog(await apiRequest<SizzleCatalog>("/sizzle/products"));
      setCatalogError(null);
    } catch (err) {
      setCatalogError(err instanceof ApiRequestError ? err.message : t("sizzle.catalog.loadFailed"));
    }
  }, [t]);

  // Ist ein Abgleich mit dem Shop fertig, kommen neue Preise und Produkte (auch in bestehenden Wuenschen)
  const refresh = useSizzleRefresh(
    useCallback(() => {
      void loadCatalog();
      void loadWishes();
    }, [loadCatalog, loadWishes])
  );
  const startRefresh = refresh.start;

  // Beim Oeffnen der Seite: Liste sofort zeigen und im Hintergrund aktualisieren (hoechstens alle 5 Minuten)
  useEffect(() => {
    void loadWishes();
    void loadCatalog();
    void startRefresh(true);
  }, [loadWishes, loadCatalog, startRefresh]);

  // Fehler bei Aktionen anzeigen statt sie zu verschlucken; im Auswahldialog dort, sonst auf der Seite
  async function guarded(action: () => Promise<void>): Promise<void> {
    setError(null);
    try {
      await action();
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : t("wishlist.saveFailed");
      if (pickerOpen) {
        setCatalogError(message);
      } else {
        setError(message);
      }
    }
  }

  async function addWish(productId: string, quantity: number): Promise<void> {
    await guarded(async () => {
      setCatalogError(null);
      await apiRequest("/sizzle/wishes", { method: "POST", body: JSON.stringify({ productId, quantity }) });
      await loadWishes();
    });
  }

  function replaceWish(updated: SizzleWish): void {
    setWishes((current) => current?.map((entry) => (entry.id === updated.id ? updated : entry)) ?? null);
  }

  async function patchWish(wish: SizzleWish, patch: { status?: WishlistStatus; inOrder?: boolean }): Promise<void> {
    await guarded(async () => {
      replaceWish(await apiRequest<SizzleWish>(`/sizzle/wishes/${wish.id}`, { method: "PATCH", body: JSON.stringify(patch) }));
    });
  }

  async function bulk(ids: string[], patch: SizzleBulkPatch): Promise<void> {
    await guarded(async () => {
      await apiRequest("/sizzle/wishes/bulk", { method: "PATCH", body: JSON.stringify({ ids, ...patch }) });
      await loadWishes();
    });
  }

  async function saveCost(next: SizzleOrderCost): Promise<void> {
    await guarded(async () => {
      setCost(await apiRequest<SizzleOrderCost>("/sizzle/costs", { method: "PUT", body: JSON.stringify(next) }));
    });
  }

  async function saveEdit(wish: SizzleWish, quantity: number, note: string | null): Promise<void> {
    replaceWish(await apiRequest<SizzleWish>(`/sizzle/wishes/${wish.id}`, { method: "PATCH", body: JSON.stringify({ quantity, note }) }));
    setEditing(null);
  }

  async function remove(wish: SizzleWish): Promise<void> {
    if (!window.confirm(t("sizzle.confirmDelete", { title: sizzleProductLabel(wish.product) }))) {
      return;
    }
    await guarded(async () => {
      await apiRequest(`/sizzle/wishes/${wish.id}`, { method: "DELETE" });
      await loadWishes();
    });
  }

  async function clearDone(): Promise<void> {
    if (!window.confirm(t("wishlist.confirmClearDone"))) {
      return;
    }
    await guarded(async () => {
      await apiRequest("/sizzle/wishes/done", { method: "DELETE" });
      await loadWishes();
    });
  }

  const canEdit = (wish: SizzleWish): boolean => user?.role === "ADMIN" || user?.id === wish.addedByUserId;
  const mineByVariant = useMemo(() => {
    const mine = new Map<string, number>();
    for (const wish of wishes ?? []) {
      if (wish.addedByUserId === user?.id && wish.status === "OPEN" && !wish.inOrder) {
        mine.set(wish.product.id, (mine.get(wish.product.id) ?? 0) + wish.quantity);
      }
    }
    return mine;
  }, [wishes, user?.id]);

  const visible = (wishes ?? []).filter((wish) => matchesFilter(wish, filter));
  const sorted = [...visible].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const people = sortAlphabetically([...new Set((wishes ?? []).map((wish) => wish.addedByName))], (name) => name, i18n.language);
  const doneCount = (wishes ?? []).filter((wish) => wish.status === "DONE").length;
  const orderCount = (wishes ?? []).filter((wish) => wish.inOrder).length;
  const openOutside = visible.filter((wish) => wish.status === "OPEN" && !wish.inOrder);

  const tabButton = (value: SizzleTab, label: string): React.JSX.Element => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={`rounded-lg px-2 py-1.5 text-sm font-medium sm:px-4 ${tab === value ? "text-white" : "text-[var(--color-text-secondary)]"}`}
      style={tab === value ? { backgroundColor: "var(--accent)" } : undefined}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{t("sizzle.title")}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">{t("sizzle.hint")}</p>
        </div>
        <div className="relative flex w-full items-center gap-2 md:w-auto">
          <button type="button" onClick={() => setPickerOpen(true)} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "var(--accent)" }}>
            {t("sizzle.pick")}
          </button>
          <div className="md:hidden">
            <SizzleRefreshChip view={refresh} syncedAt={catalog?.syncedAt ?? null} onRefresh={() => void startRefresh(false)} onCancel={refresh.cancel} />
          </div>
        </div>
      </div>
      <div className="hidden md:block">
        <SizzleRefreshCard view={refresh} syncedAt={catalog?.syncedAt ?? null} onRefresh={() => void startRefresh(false)} onCancel={refresh.cancel} />
      </div>

      <div role="tablist" className="flex gap-1 self-start rounded-xl border border-[var(--color-border)] bg-white p-1">
        {tabButton("list", t("sizzle.tabs.list"))}
        {tabButton("order", t("sizzle.tabs.order", { count: orderCount }))}
        {tabButton("settlement", t("sizzle.tabs.settlement"))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {!wishes && !error && <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>}

      {tab === "list" && wishes && (
        <>
          {wishes.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{t("sizzle.empty")}</p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="search"
                value={filter.search}
                onChange={(event) => setFilter({ ...filter, search: event.target.value })}
                placeholder={t("sizzle.filter.search")}
                aria-label={t("sizzle.filter.search")}
                className={`${WISHLIST_INPUT_CLASS} min-w-40 flex-1`}
              />
              <select value={filter.status} onChange={(event) => setFilter({ ...filter, status: STATUS_ORDER.find((status) => status === event.target.value) ?? "" })} aria-label={t("wishlist.statusLabel")} className={WISHLIST_INPUT_CLASS}>
                <option value="">{t("sizzle.filter.anyStatus")}</option>
                {sortAlphabetically(STATUS_ORDER, (status) => t(`wishlist.status.${status}`), i18n.language).map((status) => (
                  <option key={status} value={status}>
                    {t(`wishlist.status.${status}`)}
                  </option>
                ))}
              </select>
              <select value={filter.addedBy} onChange={(event) => setFilter({ ...filter, addedBy: event.target.value })} aria-label={t("sizzle.filter.person")} className={WISHLIST_INPUT_CLASS}>
                <option value="">{t("sizzle.filter.anyPerson")}</option>
                {people.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-4">
            {openOutside.length > 0 && (
              <button type="button" onClick={() => void bulk(openOutside.map((wish) => wish.id), { inOrder: true })} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                {t("sizzle.allToOrder", { count: openOutside.length })}
              </button>
            )}
            {doneCount > 0 && (
              <button type="button" onClick={() => void clearDone()} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                {t("wishlist.clearDone", { count: doneCount })}
              </button>
            )}
          </div>
          {wishes.length > 0 && visible.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("wishlist.filter.noMatch")}</p>}
          <ul className="flex flex-col gap-2">
            {sorted.map((wish) => (
              <SizzleWishRow
                key={wish.id}
                wish={wish}
                canEdit={canEdit(wish)}
                onStatus={(entry, status) => void patchWish(entry, { status })}
                onInOrder={(entry, inOrder) => void patchWish(entry, { inOrder })}
                onEdit={setEditing}
                onRemove={(entry) => void remove(entry)}
              />
            ))}
          </ul>
        </>
      )}

      {tab === "order" && wishes && <SizzleOrderView wishes={wishes} cost={cost} onBulk={(ids, patch) => void bulk(ids, patch)} onCost={(next) => void saveCost(next)} />}
      {tab === "settlement" && wishes && <SizzleSettlementView wishes={wishes} cost={cost} />}

      {pickerOpen && (
        <SizzleCatalogModal
          products={catalog?.products ?? []}
          syncedAt={catalog?.syncedAt ?? null}
          error={catalogError}
          mineByVariant={mineByVariant}
          onAdd={addWish}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {editing && <SizzleWishEditModal wish={editing} onSave={(quantity, note) => saveEdit(editing, quantity, note)} onClose={() => setEditing(null)} />}
    </div>
  );
}
