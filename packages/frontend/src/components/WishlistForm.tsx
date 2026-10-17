import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { presetManufacturerId, type CreateWishlistItemInput, type Manufacturer, type Material, type WishlistItem } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { fetchSpoolFormDefaults } from "../lib/spoolPhoto.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { WishlistColorSelect, colorOptionsFor, type WishlistColor } from "./WishlistColorSelect.js";

export const WISHLIST_INPUT_CLASS = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)]";

interface WishlistFormProps {
  editing: WishlistItem | null;
  onSaved: () => Promise<void>;
  onCancelEdit: () => void;
}

// Formular zum Hinzufuegen bzw. (wenn `editing` gesetzt ist) Aendern eines Wunsches.
export function WishlistForm({ editing, onSaved, onCancelEdit }: WishlistFormProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [color, setColor] = useState<WishlistColor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Standard-Hersteller aus den Einstellungen (wie im "Neue Spule"-Formular): vorbelegt, aber aenderbar
  const [defaultManufacturerId, setDefaultManufacturerId] = useState<string | null>(null);
  const presetApplied = useRef(false);
  const presetId = presetManufacturerId(defaultManufacturerId, manufacturers);

  useEffect(() => {
    // Ohne Standard-Hersteller (oder bei einem Ladefehler) bleibt es bei "Beliebiger Hersteller"
    fetchSpoolFormDefaults()
      .then((defaults) => setDefaultManufacturerId(defaults.defaultManufacturerId))
      .catch(() => setDefaultManufacturerId(null));
  }, []);

  // Einmalig vorbelegen, sobald Standard-Hersteller und Herstellerliste da sind - nie, wenn gerade ein Wunsch bearbeitet
  // wird oder schon ein Hersteller gewaehlt wurde.
  useEffect(() => {
    if (presetApplied.current || editing || presetId === "") {
      return;
    }
    presetApplied.current = true;
    setManufacturerId((current) => (current === "" ? presetId : current));
  }, [presetId, editing]);

  useEffect(() => {
    // Fuer die "wie bei Neue Spule"-Dropdowns, die den Titel vorbefuellen; Fehler dabei sind nicht kritisch.
    apiRequest<Manufacturer[]>("/manufacturers").then(setManufacturers).catch(() => setManufacturers([]));
    apiRequest<Material[]>("/materials").then(setMaterials).catch(() => setMaterials([]));
  }, []);

  useEffect(() => {
    if (!editing) {
      return;
    }
    setTitle(editing.title);
    setNote(editing.note ?? "");
    setQuantity(String(editing.quantity));
    setManufacturerId(editing.manufacturerId ?? "");
    setMaterialId(editing.materialId ?? "");
    setColor(editing.colorName && editing.colorHex ? { name: editing.colorName, hex: editing.colorHex } : null);
  }, [editing]);

  const availableMaterials = manufacturerId
    ? materials.filter((material) => material.manufacturerId === manufacturerId || material.manufacturerId === null)
    : materials;

  const manufacturerName = manufacturers.find((manufacturer) => manufacturer.id === manufacturerId)?.name ?? null;
  const materialName = materials.find((material) => material.id === materialId)?.name ?? null;

  // Auswahl aus den Dropdowns setzt/ergaenzt den Titel - der bleibt trotzdem frei editierbar (z.B. fuer Menge-Details).
  // Die Farbliste haengt von Hersteller+Material ab: passt die gewaehlte Farbe nicht mehr dazu, wird sie zurueckgesetzt.
  function applyCatalogPick(nextManufacturerId: string, nextMaterialId: string, nextColor: WishlistColor | null): void {
    const nextManufacturerName = manufacturers.find((manufacturer) => manufacturer.id === nextManufacturerId)?.name ?? null;
    const nextMaterialName = materials.find((material) => material.id === nextMaterialId)?.name ?? null;
    const colorStillValid = nextColor && colorOptionsFor(nextManufacturerName, nextMaterialName, null, i18n.language).some((option) => option.name === nextColor.name);
    const keptColor = colorStillValid ? nextColor : null;
    setManufacturerId(nextManufacturerId);
    setMaterialId(nextMaterialId);
    setColor(keptColor);
    const combined = [nextManufacturerName, nextMaterialName, keptColor?.name].filter(Boolean).join(" ");
    if (combined) {
      setTitle(combined);
    }
  }

  function resetForm(): void {
    setTitle("");
    setNote("");
    setQuantity("1");
    setManufacturerId(presetId);
    setMaterialId("");
    setColor(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("wishlist.titleRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input: CreateWishlistItemInput = {
        title: title.trim(),
        note: note.trim() ? note.trim() : null,
        quantity: Number(quantity) || 1,
        manufacturerId: manufacturerId || null,
        materialId: materialId || null,
        colorName: color?.name ?? null,
        colorHex: color?.hex ?? null
      };
      if (editing) {
        await apiRequest(`/wishlist/${editing.id}`, { method: "PATCH", body: JSON.stringify(input) });
      } else {
        await apiRequest("/wishlist", { method: "POST", body: JSON.stringify(input) });
      }
      resetForm();
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("wishlist.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  function cancel(): void {
    resetForm();
    onCancelEdit();
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-border)] bg-white p-4 sm:flex sm:flex-wrap sm:items-end"
    >
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)] sm:flex-1">
        {t("spools.manufacturer")}
        <select value={manufacturerId} onChange={(event) => applyCatalogPick(event.target.value, materialId, color)} className={WISHLIST_INPUT_CLASS}>
          <option value="">{t("wishlist.anyManufacturer")}</option>
          {sortAlphabetically(manufacturers, (manufacturer) => manufacturer.name, i18n.language).map((manufacturer) => (
            <option key={manufacturer.id} value={manufacturer.id}>
              {manufacturer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)] sm:flex-1">
        {t("spools.material")}
        <select value={materialId} onChange={(event) => applyCatalogPick(manufacturerId, event.target.value, color)} className={WISHLIST_INPUT_CLASS}>
          <option value="">{t("wishlist.anyMaterial")}</option>
          {sortAlphabetically(availableMaterials, (material) => material.name, i18n.language).map((material) => (
            <option key={material.id} value={material.id}>
              {material.name}
            </option>
          ))}
        </select>
      </label>
      <WishlistColorSelect
        value={color}
        onChange={(next) => applyCatalogPick(manufacturerId, materialId, next)}
        manufacturerName={manufacturerName}
        materialName={materialName}
        className={WISHLIST_INPUT_CLASS}
      />
      <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)] sm:flex-1">
        {t("wishlist.itemTitle")}
        <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} className={WISHLIST_INPUT_CLASS} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)] sm:w-20">
        {t("wishlist.quantity")}
        <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} className={WISHLIST_INPUT_CLASS} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)] sm:flex-1">
        {t("wishlist.note")}
        <input type="text" value={note} onChange={(event) => setNote(event.target.value)} className={WISHLIST_INPUT_CLASS} />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="col-span-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-auto"
        style={{ backgroundColor: "var(--accent)" }}
      >
        {editing ? t("common.save") : t("wishlist.add")}
      </button>
      {editing && (
        <button type="button" onClick={cancel} className="col-span-2 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium sm:col-auto">
          {t("common.cancel")}
        </button>
      )}
      {error && <p className="col-span-2 w-full text-sm text-[var(--color-danger)]">{error}</p>}
    </form>
  );
}
