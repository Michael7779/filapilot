import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  addBulkEntry,
  availableMaterialsFor,
  bulkEntryKey,
  bulkGroupKey,
  changeBulkCount,
  getColorPresets,
  suggestPrice,
  totalBulkSpools,
  type BulkCreateSpoolsInput,
  type BulkSpoolEntry,
  type Inventory,
  type Manufacturer,
  type Material,
  type SpoolPriceSuggestion
} from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { BulkSpoolColorPicker } from "./BulkSpoolColorPicker.js";
import { BulkSpoolList } from "./BulkSpoolList.js";
import { SpoolPackagingField } from "./SpoolPackagingField.js";

const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";
const INPUT_CLASS = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";

interface BulkSpoolModalProps {
  materials: Material[];
  manufacturers: Manufacturer[];
  // Lager, in denen der Benutzer Spulen anlegen darf, und das vorbelegte Lager
  inventories: Inventory[];
  defaultInventoryId: string;
  defaultManufacturerId: string | null;
  priceSuggestions: SpoolPriceSuggestion[];
  onClose: () => void;
  onCreated: (count: number) => void;
}

// Euro-Text -> Cent; leer = kein Preis, ungueltig = NaN (der Aufrufer meldet das).
function toCents(value: string | undefined): number | null {
  return value?.trim() ? Math.round(Number(value) * 100) : null;
}

// Dialog "Mehrere Spulen": Hersteller und Material waehlen, Farben anklicken (jeder Klick = eine Spule in der Liste, mit
// Zaehler je Farbe), dann alles in einem Schritt anlegen. Der Preis gilt je Hersteller + Material + Lieferform und wird
// wie beim einzelnen Anlegen vorgeschlagen (zuletzt eingetragener Preis, sonst Richtpreis des Materials).
export function BulkSpoolModal({ materials, manufacturers, inventories, defaultInventoryId, defaultManufacturerId, priceSuggestions, onClose, onCreated }: BulkSpoolModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [inventoryId, setInventoryId] = useState(defaultInventoryId);
  const [location, setLocation] = useState("");
  const [alreadyOpened, setAlreadyOpened] = useState(false);
  const [manufacturerId, setManufacturerId] = useState(defaultManufacturerId ?? "");
  const [materialId, setMaterialId] = useState("");
  const [isRefill, setIsRefill] = useState(false);
  const [weight, setWeight] = useState("1000");
  const [entries, setEntries] = useState<BulkSpoolEntry[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const material = materials.find((entry) => entry.id === materialId);
  const manufacturer = manufacturers.find((entry) => entry.id === manufacturerId);
  const effectiveRefill = !alreadyOpened && isRefill;
  const weightG = Number(weight);
  const canPick = Boolean(material && manufacturer && Number.isInteger(weightG) && weightG > 0);
  const presets = getColorPresets(manufacturer?.name ?? null, material?.name ?? null);
  const total = totalBulkSpools(entries);

  function handleManufacturerChange(id: string): void {
    setManufacturerId(id);
    if (!availableMaterialsFor(materials, id || null).some((entry) => entry.id === materialId)) {
      setMaterialId("");
    }
  }

  function pickColor(colorName: string, colorHex: string | null): void {
    if (!material || !canPick) {
      return;
    }
    const entry = { manufacturerId, materialId, isRefill: effectiveRefill, initialWeightG: weightG, colorName, colorHex };
    const groupKey = bulkGroupKey(entry);
    if (!(groupKey in prices)) {
      const suggested = suggestPrice(priceSuggestions, material, manufacturerId, effectiveRefill);
      setPrices((current) => ({ ...current, [groupKey]: suggested ? String(suggested.priceCents / 100) : "" }));
    }
    setEntries((current) => addBulkEntry(current, entry));
  }

  function changeCount(entryKey: string, delta: number): void {
    setEntries((current) => changeBulkCount(current, entryKey, delta));
  }

  function buildRequest(): BulkCreateSpoolsInput | null {
    const items = entries.map((entry) => ({
      manufacturerId: entry.manufacturerId,
      materialId: entry.materialId,
      colorName: entry.colorName,
      colorHex: entry.colorHex,
      isRefill: entry.isRefill,
      initialWeightG: entry.initialWeightG,
      purchasePriceCents: toCents(prices[bulkGroupKey(entry)]),
      count: entry.count
    }));
    if (items.some((item) => item.purchasePriceCents !== null && (!Number.isFinite(item.purchasePriceCents) || item.purchasePriceCents < 0))) {
      return null;
    }
    return { inventoryId, location: location.trim() ? location.trim() : null, alreadyOpened, items };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const request = buildRequest();
    if (!request) {
      setError(t("spools.bulk.invalidPrice"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiRequest<{ created: number }>("/spools/bulk", { method: "POST", body: JSON.stringify(request) });
      onCreated(result.created);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("spools.bulk.failed"));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex max-h-[90dvh] w-full max-w-[640px] flex-col gap-4 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{t("spools.bulk.title")}</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {inventories.length > 1 && (
            <label className={LABEL_CLASS}>
              {t("spools.inventory")}
              <select value={inventoryId} onChange={(event) => setInventoryId(event.target.value)} className={INPUT_CLASS}>
                {sortAlphabetically(inventories, (entry) => entry.name, i18n.language).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={LABEL_CLASS}>
            {t("spools.location")}
            <input type="text" value={location} maxLength={60} onChange={(event) => setLocation(event.target.value)} className={INPUT_CLASS} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <input type="checkbox" checked={alreadyOpened} onChange={(event) => setAlreadyOpened(event.target.checked)} />
          {t("spools.alreadyOpened")}
        </label>

        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={LABEL_CLASS}>
              {t("spools.manufacturer")}
              <select value={manufacturerId} onChange={(event) => handleManufacturerChange(event.target.value)} className={INPUT_CLASS}>
                <option value="">{t("spools.selectManufacturer")}</option>
                {sortAlphabetically(manufacturers, (entry) => entry.name, i18n.language).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              {t("spools.material")}
              <select value={materialId} onChange={(event) => setMaterialId(event.target.value)} disabled={!manufacturerId} className={INPUT_CLASS}>
                <option value="">{manufacturerId ? t("spools.selectMaterial") : t("spools.selectManufacturerFirst")}</option>
                {sortAlphabetically(availableMaterialsFor(materials, manufacturerId || null), (entry) => entry.name, i18n.language).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            {!alreadyOpened && <SpoolPackagingField isRefill={isRefill} onChange={setIsRefill} />}
            <label className={`w-44 ${LABEL_CLASS}`}>
              {t("spools.initialWeight")}
              <input type="number" min={1} value={weight} onChange={(event) => setWeight(event.target.value)} className={INPUT_CLASS} />
            </label>
          </div>
          {canPick ? (
            <BulkSpoolColorPicker
              presets={presets}
              countFor={(colorName) => entries.find((entry) => bulkEntryKey(entry) === bulkEntryKey({ manufacturerId, materialId, isRefill: effectiveRefill, initialWeightG: weightG, colorName, colorHex: null }))?.count ?? 0}
              disabled={!canPick}
              onPick={pickColor}
            />
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">{t("spools.bulk.pickHint")}</p>
          )}
        </div>

        {entries.length > 0 && (
          <BulkSpoolList
            entries={entries}
            manufacturers={manufacturers}
            materials={materials}
            prices={prices}
            onPriceChange={(groupKey, value) => setPrices((current) => ({ ...current, [groupKey]: value }))}
            onCountChange={changeCount}
          />
        )}

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting || total === 0}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {t("spools.bulk.submit", { count: total })}
          </button>
        </div>
      </form>
    </div>
  );
}
