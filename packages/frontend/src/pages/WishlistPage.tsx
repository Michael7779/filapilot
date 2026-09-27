import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CreateWishlistItemInput, Manufacturer, Material, WishlistItem, WishlistStatus } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { useAuthStore } from "../stores/useAuthStore.js";

const STATUS_ORDER: WishlistStatus[] = ["OPEN", "ORDERED", "DONE"];
const STATUS_STYLE: Record<WishlistStatus, { bg: string; fg: string }> = {
  OPEN: { bg: "var(--color-bg)", fg: "var(--color-text-secondary)" },
  ORDERED: { bg: "#e4edfd", fg: "#1f4fb8" },
  DONE: { bg: "#e3f4e8", fg: "#1a6b3a" }
};

const INPUT_CLASS = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)]";

// Instanzweite Wunschliste fuer eine Sammelbestellung: jeder sieht, wer was hinzugefuegt hat, und kann den
// Status setzen; Titel/Notiz/Menge aendern oder loeschen darf nur, wer den Eintrag hinzugefuegt hat, oder ein Admin.
export function WishlistPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load(): Promise<void> {
    try {
      setItems(await apiRequest<WishlistItem[]>("/wishlist"));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("wishlist.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
    // Fuer die "wie bei Neue Spule"-Dropdowns, die den Titel vorbefuellen; Fehler dabei sind nicht kritisch.
    apiRequest<Manufacturer[]>("/manufacturers").then(setManufacturers).catch(() => setManufacturers([]));
    apiRequest<Material[]>("/materials").then(setMaterials).catch(() => setMaterials([]));
  }, []);

  const availableMaterials = manufacturerId
    ? materials.filter((material) => material.manufacturerId === manufacturerId || material.manufacturerId === null)
    : materials;

  // Auswahl aus den Dropdowns setzt/ergaenzt den Titel - der bleibt trotzdem frei editierbar (z.B. fuer Farbe/Menge-Details).
  function applyCatalogPick(nextManufacturerId: string, nextMaterialId: string): void {
    const manufacturerName = manufacturers.find((manufacturer) => manufacturer.id === nextManufacturerId)?.name ?? "";
    const materialName = materials.find((material) => material.id === nextMaterialId)?.name ?? "";
    const combined = [manufacturerName, materialName].filter(Boolean).join(" ");
    if (combined) {
      setTitle(combined);
    }
  }

  function canEditContent(item: WishlistItem): boolean {
    return user?.role === "ADMIN" || user?.id === item.addedByUserId;
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("wishlist.titleRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input: CreateWishlistItemInput = { title: title.trim(), note: note.trim() ? note.trim() : null, quantity: Number(quantity) || 1 };
      if (editing) {
        await apiRequest(`/wishlist/${editing.id}`, { method: "PATCH", body: JSON.stringify(input) });
      } else {
        await apiRequest("/wishlist", { method: "POST", body: JSON.stringify(input) });
      }
      setTitle("");
      setNote("");
      setQuantity("1");
      setManufacturerId("");
      setMaterialId("");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("wishlist.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(item: WishlistItem): void {
    setEditing(item);
    setTitle(item.title);
    setNote(item.note ?? "");
    setQuantity(String(item.quantity));
  }

  async function setStatus(item: WishlistItem, status: WishlistStatus): Promise<void> {
    try {
      const updated = await apiRequest<WishlistItem>(`/wishlist/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((current) => current?.map((entry) => (entry.id === updated.id ? updated : entry)) ?? null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("wishlist.saveFailed"));
    }
  }

  async function remove(item: WishlistItem): Promise<void> {
    if (!window.confirm(t("wishlist.confirmDelete", { title: item.title }))) {
      return;
    }
    await apiRequest(`/wishlist/${item.id}`, { method: "DELETE" });
    await load();
  }

  const sorted = items ? [...items].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold">{t("wishlist.title")}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">{t("wishlist.hint")}</p>
      </div>

      <form onSubmit={(event) => void handleAdd(event)} className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--color-border)] bg-white p-4">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("spools.manufacturer")}
          <select
            value={manufacturerId}
            onChange={(event) => {
              setManufacturerId(event.target.value);
              applyCatalogPick(event.target.value, materialId);
            }}
            className={INPUT_CLASS}
          >
            <option value="">{t("wishlist.anyManufacturer")}</option>
            {sortAlphabetically(manufacturers, (manufacturer) => manufacturer.name, i18n.language).map((manufacturer) => (
              <option key={manufacturer.id} value={manufacturer.id}>
                {manufacturer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("spools.material")}
          <select
            value={materialId}
            onChange={(event) => {
              setMaterialId(event.target.value);
              applyCatalogPick(manufacturerId, event.target.value);
            }}
            className={INPUT_CLASS}
          >
            <option value="">{t("wishlist.anyMaterial")}</option>
            {sortAlphabetically(availableMaterials, (material) => material.name, i18n.language).map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("wishlist.itemTitle")}
          <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} className={INPUT_CLASS} />
        </label>
        <label className="flex w-20 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("wishlist.quantity")}
          <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} className={INPUT_CLASS} />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("wishlist.note")}
          <input type="text" value={note} onChange={(event) => setNote(event.target.value)} className={INPUT_CLASS} />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {editing ? t("common.save") : t("wishlist.add")}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setTitle("");
              setManufacturerId("");
              setMaterialId("");
              setNote("");
              setQuantity("1");
            }}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
          >
            {t("common.cancel")}
          </button>
        )}
      </form>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {!items && !error && <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>}
      {items && items.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t("wishlist.empty")}</p>}

      {sorted.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sorted.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {item.quantity > 1 ? `${item.quantity}x ` : ""}
                    {item.title}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: STATUS_STYLE[item.status].bg, color: STATUS_STYLE[item.status].fg }}>
                    {t(`wishlist.status.${item.status}`)}
                  </span>
                </div>
                {item.note && <div className="text-sm text-[var(--color-text-secondary)]">{item.note}</div>}
                <div className="text-xs text-[var(--color-text-muted)]">
                  {t("wishlist.addedBy", { name: item.addedByName, date: new Date(item.createdAt).toLocaleDateString(i18n.language) })}
                  {item.updatedByName && item.updatedByName !== item.addedByName
                    ? ` · ${t("wishlist.updatedBy", { name: item.updatedByName })}`
                    : ""}
                </div>
              </div>
              <select
                value={item.status}
                onChange={(event) => void setStatus(item, event.target.value as WishlistStatus)}
                className={INPUT_CLASS}
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {t(`wishlist.status.${status}`)}
                  </option>
                ))}
              </select>
              {canEditContent(item) && (
                <div className="flex gap-2 text-xs font-medium">
                  <button type="button" onClick={() => startEdit(item)} style={{ color: "var(--accent)" }}>
                    {t("common.edit")}
                  </button>
                  <button type="button" onClick={() => void remove(item)} className="text-[var(--color-danger)]">
                    {t("common.delete")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
