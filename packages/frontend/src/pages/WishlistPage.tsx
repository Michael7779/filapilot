import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EMPTY_WISHLIST_FILTER, filterWishlistItems, type WishlistFilter, type WishlistItem, type WishlistStatus } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { STATUS_ORDER } from "../lib/wishlistStatus.js";
import { useAuthStore } from "../stores/useAuthStore.js";
import { WishlistFilterBar } from "../components/WishlistFilterBar.js";
import { WishlistForm } from "../components/WishlistForm.js";
import { WishlistItemRow } from "../components/WishlistItemRow.js";
import { WishlistOrderView, type BulkPatch } from "../components/WishlistOrderView.js";

type WishlistTab = "list" | "order";

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

  async function load(): Promise<void> {
    try {
      setItems(await apiRequest<WishlistItem[]>("/wishlist"));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("wishlist.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
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

  async function patchItem(item: WishlistItem, patch: { status?: WishlistStatus; inOrder?: boolean }): Promise<void> {
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
      </div>

      {tab === "list" && <WishlistForm editing={editing} onSaved={async () => { setEditing(null); await load(); }} onCancelEdit={() => setEditing(null)} />}

      {items && items.length > 0 && <WishlistFilterBar items={items} filter={filter} onChange={setFilter} />}

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {!items && !error && <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>}
      {items && items.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("wishlist.empty")}</p>}
      {items && items.length > 0 && visible.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("wishlist.filter.noMatch")}</p>}

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
          canEdit={canEditContent}
          onToggle={(item, inOrder) => void patchItem(item, { inOrder })}
          onBulk={(ids, patch) => void bulk(ids, patch)}
          onStatus={(item, status) => void patchItem(item, { status })}
          onEdit={startEdit}
          onRemove={(item) => void remove(item)}
        />
      )}
    </div>
  );
}
