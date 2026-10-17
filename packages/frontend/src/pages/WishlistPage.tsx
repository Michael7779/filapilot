import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EMPTY_WISHLIST_FILTER,
  filterWishlistItems,
  type Material,
  type WishlistFilter,
  type WishlistItem,
  type WishlistOrderCost,
  type WishlistStatus
} from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { STATUS_ORDER } from "../lib/wishlistStatus.js";
import { useAuthStore } from "../stores/useAuthStore.js";
import { WishlistFilterBar } from "../components/WishlistFilterBar.js";
import { WishlistForm } from "../components/WishlistForm.js";
import { WishlistItemRow } from "../components/WishlistItemRow.js";
import { WishlistOrderView, type BulkPatch } from "../components/WishlistOrderView.js";
import { WishlistSettlementView } from "../components/WishlistSettlementView.js";

type WishlistTab = "list" | "order" | "settlement";

// Ersetzt die Nebenkosten eines Herstellers in der Liste (oder fuegt sie hinzu)
function withCost(costs: readonly WishlistOrderCost[], saved: WishlistOrderCost): WishlistOrderCost[] {
  return [...costs.filter((entry) => entry.manufacturerId !== saved.manufacturerId), saved];
}

// Instanzweite Wunschliste fuer eine Sammelbestellung: jeder sieht, wer was hinzugefuegt hat, und kann den
// Status setzen; Titel/Notiz/Menge aendern oder loeschen darf nur, wer den Eintrag hinzugefuegt hat, oder ein Admin.
// Die Bestellliste ist dieselbe Liste, nach Hersteller gruppiert, mit Auswahl (inOrder) fuer die tatsaechliche Bestellung.
export function WishlistPage(): React.JSX.Element {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [tab, setTab] = useState<WishlistTab>("list");
  const [filter, setFilter] = useState<WishlistFilter>(EMPTY_WISHLIST_FILTER);
  const [costs, setCosts] = useState<WishlistOrderCost[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  async function load(): Promise<void> {
    try {
      const [loadedItems, loadedCosts] = await Promise.all([apiRequest<WishlistItem[]>("/wishlist"), apiRequest<WishlistOrderCost[]>("/wishlist/costs")]);
      setItems(loadedItems);
      setCosts(loadedCosts);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("wishlist.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
    // Richtpreise der Materialien als Preisvorschlag in der Bestellliste; ohne sie geht es einfach ohne Vorschlag
    apiRequest<Material[]>("/materials").then(setMaterials).catch(() => setMaterials([]));
  }, []);

  function canEditContent(item: WishlistItem): boolean {
    return user?.role === "ADMIN" || user?.id === item.addedByUserId;
  }

  // Fehler bei Aktionen anzeigen statt sie zu verschlucken
  async function guarded(action: () => Promise<void>): Promise<void> {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("wishlist.saveFailed"));
    }
  }

  function replaceItem(updated: WishlistItem): void {
    setItems((current) => current?.map((entry) => (entry.id === updated.id ? updated : entry)) ?? null);
  }

  async function patchItem(item: WishlistItem, patch: { status?: WishlistStatus; inOrder?: boolean; unitPriceCents?: number | null }): Promise<void> {
    await guarded(async () => {
      replaceItem(await apiRequest<WishlistItem>(`/wishlist/${item.id}`, { method: "PATCH", body: JSON.stringify(patch) }));
    });
  }

  async function bulk(ids: string[], patch: BulkPatch): Promise<void> {
    await guarded(async () => {
      await apiRequest("/wishlist/bulk", { method: "PATCH", body: JSON.stringify({ ids, ...patch }) });
      await load();
    });
  }

  async function saveCosts(manufacturerId: string, shippingCents: number, discountCents: number): Promise<void> {
    await guarded(async () => {
      const saved = await apiRequest<WishlistOrderCost>(`/wishlist/costs/${manufacturerId}`, {
        method: "PUT",
        body: JSON.stringify({ shippingCents, discountCents })
      });
      setCosts((current) => withCost(current, saved));
    });
  }

  function startEdit(item: WishlistItem): void {
    setEditing(item);
    setTab("list");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(item: WishlistItem): Promise<void> {
    if (!window.confirm(t("wishlist.confirmDelete", { title: item.title }))) {
      return;
    }
    await guarded(async () => {
      await apiRequest(`/wishlist/${item.id}`, { method: "DELETE" });
      await load();
    });
  }

  async function clearDone(): Promise<void> {
    if (!window.confirm(t("wishlist.confirmClearDone"))) {
      return;
    }
    await guarded(async () => {
      await apiRequest("/wishlist/done", { method: "DELETE" });
      await load();
    });
  }

  const visible = items ? filterWishlistItems(items, filter) : [];
  const sorted = [...visible].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const doneCount = items ? items.filter((item) => item.status === "DONE").length : 0;
  const orderCount = items ? items.filter((item) => item.inOrder).length : 0;

  const tabButton = (value: WishlistTab, label: string): React.JSX.Element => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === value ? "text-white" : "text-[var(--color-text-secondary)]"}`}
      style={tab === value ? { backgroundColor: "var(--accent)" } : undefined}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold">{t("wishlist.title")}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">{t("wishlist.hint")}</p>
      </div>

      <div role="tablist" className="flex gap-1 self-start rounded-xl border border-[var(--color-border)] bg-white p-1">
        {tabButton("list", t("wishlist.tabs.list"))}
        {tabButton("order", t("wishlist.tabs.order", { count: orderCount }))}
        {tabButton("settlement", t("wishlist.tabs.settlement"))}
      </div>

      {tab === "list" && <WishlistForm editing={editing} onSaved={async () => { setEditing(null); await load(); }} onCancelEdit={() => setEditing(null)} />}

      {items && items.length > 0 && tab !== "settlement" && <WishlistFilterBar items={items} filter={filter} onChange={setFilter} />}

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {!items && !error && <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>}
      {items && items.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("wishlist.empty")}</p>}
      {items && items.length > 0 && tab !== "settlement" && visible.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("wishlist.filter.noMatch")}</p>}

      {tab === "list" && doneCount > 0 && (
        <button type="button" onClick={() => void clearDone()} className="self-start text-sm font-medium" style={{ color: "var(--accent)" }}>
          {t("wishlist.clearDone", { count: doneCount })}
        </button>
      )}

      {tab === "list" && sorted.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sorted.map((item) => (
            <WishlistItemRow
              key={item.id}
              item={item}
              canEdit={canEditContent(item)}
              showInOrderBadge
              onStatus={(entry, status) => void patchItem(entry, { status })}
              onEdit={startEdit}
              onRemove={(entry) => void remove(entry)}
            />
          ))}
        </ul>
      )}

      {tab === "order" && visible.length > 0 && (
        <WishlistOrderView
          items={visible}
          costs={costs}
          materials={materials}
          canEdit={canEditContent}
          onCosts={(manufacturerId, shipping, discount) => void saveCosts(manufacturerId, shipping, discount)}
          onBulk={(ids, patch) => void bulk(ids, patch)}
          onEdit={startEdit}
          onRemove={(item) => void remove(item)}
        />
      )}

      {tab === "settlement" && items && <WishlistSettlementView items={items} costs={costs} />}
    </div>
  );
}
