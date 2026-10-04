import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { availableMaterialsFor, suggestPrice } from "@filapilot/shared";
import { formatBedTemp } from "../lib/formatTemps.js";
import type { PhotoChange } from "../lib/spoolPhoto.js";
import { SpoolPhotoField } from "./SpoolPhotoField.js";
import { SpoolColorFields } from "./SpoolColorFields.js";
import { SpoolCustomFieldsFields } from "./SpoolCustomFieldsFields.js";
import { SpoolPackagingField } from "./SpoolPackagingField.js";
import type {
  CreateManufacturerInput,
  CreateMaterialInput,
  CreateSpoolInput,
  CustomFieldDefinition,
  CustomFieldValues,
  Inventory,
  Manufacturer,
  Material,
  SpoolPriceSuggestion,
  SpoolWithRelations
} from "@filapilot/shared";

const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";
const SELECT_CLASS =
  "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";
const SMALL_INPUT_CLASS = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm";

interface SpoolFormModalProps {
  materials: Material[];
  manufacturers: Manufacturer[];
  customFieldDefinitions: CustomFieldDefinition[];
  initialSpool: SpoolWithRelations | null;
  onClose: () => void;
  onCreateMaterial: (input: CreateMaterialInput) => Promise<Material>;
  onCreateManufacturer: (input: CreateManufacturerInput) => Promise<Manufacturer>;
  photoUploadEnabled: boolean;
  // Lager, in denen der Benutzer Spulen anlegen/aendern darf, und das vorbelegte Lager
  inventories: Inventory[];
  defaultInventoryId: string;
  // Vom Admin in den Einstellungen hinterlegter Standard-Hersteller; nur bei einer neuen Spule vorbelegt,
  // eine bestehende Spule behaelt immer ihren eigenen Hersteller.
  defaultManufacturerId: string | null;
  // Zuletzt eingetragene Preise je Hersteller + Material + Lieferform - Vorbelegung des Preises bei einer neuen Spule.
  priceSuggestions: SpoolPriceSuggestion[];
  onSubmit: (input: CreateSpoolInput, photo: PhotoChange) => Promise<void>;
}

function toFormState(spool: SpoolWithRelations | null, defaultManufacturerId: string | null) {
  return {
    materialId: spool?.materialId ?? "",
    manufacturerId: spool?.manufacturerId ?? defaultManufacturerId ?? "",
    colorName: spool?.colorName ?? "",
    colorHex: spool?.colorHex ?? "",
    colorHex2: spool?.colorHex2 ?? "",
    initialWeightG: spool ? String(spool.initialWeightG) : "1000",
    remainingWeightG: spool ? String(spool.remainingWeightG) : "1000",
    tareWeightG: spool?.tareWeightG != null ? String(spool.tareWeightG) : "",
    location: spool?.location ?? "",
    note: spool?.note ?? "",
    purchasePriceEuro: spool?.purchasePriceCents != null ? String(spool.purchasePriceCents / 100) : ""
  };
}

export function SpoolFormModal({
  materials,
  manufacturers,
  customFieldDefinitions,
  initialSpool,
  onClose,
  onCreateMaterial,
  onCreateManufacturer,
  photoUploadEnabled,
  inventories,
  defaultInventoryId,
  defaultManufacturerId,
  priceSuggestions,
  onSubmit
}: SpoolFormModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState(toFormState(initialSpool, defaultManufacturerId));
  const [customFields, setCustomFields] = useState<CustomFieldValues>(initialSpool?.customFields ?? {});
  const [showNewMaterial, setShowNewMaterial] = useState(false);
  const [newMaterial, setNewMaterial] = useState({
    name: "",
    printTempMinC: "",
    printTempMaxC: "",
    bedTempC: ""
  });
  const [showNewManufacturer, setShowNewManufacturer] = useState(false);
  const [newManufacturerName, setNewManufacturerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<PhotoChange>({ kind: "none" });
  const [inventoryId, setInventoryId] = useState(initialSpool?.inventoryId ?? defaultInventoryId);
  // Nur beim Neuanlegen relevant - eine neue Spule ist standardmaessig ungeoeffnet (siehe schema.prisma Spool.openedAt).
  const [alreadyOpened, setAlreadyOpened] = useState(false);
  const [isRefill, setIsRefill] = useState(initialSpool?.isRefill ?? false);
  // Sobald der Preis von Hand angefasst wurde (oder bei einer bestehenden Spule), wird er nicht mehr vorbelegt.
  const [priceTouched, setPriceTouched] = useState(initialSpool !== null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Materialien gelten fuer einen Hersteller oder allgemein (manufacturerId === null).
  const chosenManufacturerId = showNewManufacturer ? "" : form.manufacturerId;
  const availableMaterials = availableMaterialsFor(materials, chosenManufacturerId || null);
  const selectedMaterial = materials.find((material) => material.id === form.materialId);
  const selectedManufacturer = manufacturers.find((manufacturer) => manufacturer.id === form.manufacturerId);
  // Lieferform (Nachfuellung / mit Spule) gibt es nur bei noch nicht angebrochenen Spulen.
  const isUnopened = initialSpool ? initialSpool.openedAt === null : !alreadyOpened;
  const suggestedPrice = suggestPrice(priceSuggestions, selectedMaterial, chosenManufacturerId, isUnopened && isRefill);
  const selectedBedTemp = selectedMaterial ? formatBedTemp(selectedMaterial.bedTempC, selectedMaterial.bedTempMaxC, t) : null;

  // Bei einer neuen Spule den Preis vorbelegen, solange er nicht von Hand geaendert wurde; bei Wechsel von Material oder
  // Lieferform wird er neu vorgeschlagen (ohne Vorschlag leer).
  const suggestedCents = suggestedPrice?.priceCents ?? null;
  useEffect(() => {
    if (!priceTouched) {
      setForm((current) => ({ ...current, purchasePriceEuro: suggestedCents === null ? "" : String(suggestedCents / 100) }));
    }
  }, [priceTouched, suggestedCents]);

  function handleManufacturerChange(manufacturerId: string): void {
    const stillFits = availableMaterialsFor(materials, manufacturerId || null).some(
      (material) => material.id === form.materialId
    );
    setForm({ ...form, manufacturerId, materialId: stillFits ? form.materialId : "" });
  }

  // null = Validierung fehlgeschlagen, Fehlermeldung ist bereits gesetzt.
  async function resolveManufacturerId(): Promise<string | null> {
    if (!showNewManufacturer) {
      return form.manufacturerId;
    }
    if (!newManufacturerName.trim()) {
      setError(t("spools.newManufacturerName"));
      return null;
    }
    const created = await onCreateManufacturer({ name: newManufacturerName.trim() });
    return created.id;
  }

  async function resolveMaterialId(manufacturerId: string): Promise<string | null> {
    if (!showNewMaterial) {
      return form.materialId;
    }
    if (!newMaterial.name.trim()) {
      setError(t("spools.newMaterialName"));
      return null;
    }
    const created = await onCreateMaterial({
      name: newMaterial.name.trim(),
      manufacturerId,
      printTempMinC: Number(newMaterial.printTempMinC) || 0,
      printTempMaxC: Number(newMaterial.printTempMaxC) || 0,
      bedTempC: newMaterial.bedTempC.trim() ? Number(newMaterial.bedTempC) : null,
      bedTempMaxC: null,
      // Dichte/Durchmesser gibt es hier nicht direkt ein - laesst sich unter Einstellungen -> Stammdaten nachtragen.
      densityGCm3: null,
      filamentDiameterMm: 1.75,
      priceRefillCents: null,
      priceWithSpoolCents: null
    });
    return created.id;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const manufacturerId = await resolveManufacturerId();
      const materialId = manufacturerId ? await resolveMaterialId(manufacturerId) : null;

      if (!materialId || !manufacturerId || !form.colorName.trim()) {
        setError((prev) => prev ?? "Bitte alle Pflichtfelder ausfüllen.");
        setSubmitting(false);
        return;
      }

      await onSubmit(
        {
          materialId,
          manufacturerId,
          inventoryId,
          colorName: form.colorName.trim(),
          colorHex: form.colorHex.trim() ? form.colorHex.trim() : null,
          colorHex2: form.colorHex2.trim() ? form.colorHex2.trim() : null,
          initialWeightG: Number(form.initialWeightG),
          remainingWeightG: Number(form.remainingWeightG),
          tareWeightG: form.tareWeightG.trim() ? Number(form.tareWeightG) : null,
          purchasePriceCents: form.purchasePriceEuro.trim()
            ? Math.round(Number(form.purchasePriceEuro) * 100)
            : null,
          purchasedAt: null,
          location: form.location.trim() ? form.location.trim() : null,
          note: form.note.trim() ? form.note.trim() : null,
          isRefill: isUnopened ? isRefill : (initialSpool?.isRefill ?? false),
          customFields,
          alreadyOpened
        },
        photo
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex max-h-[90dvh] w-full max-w-[420px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">
          {initialSpool ? t("spools.editSpool") : t("spools.addSpool")}
        </h2>

        {inventories.length > 1 && (
          <label className={LABEL_CLASS}>
            {t("spools.inventory")}
            <select value={inventoryId} onChange={(event) => setInventoryId(event.target.value)} className={SELECT_CLASS}>
              {sortAlphabetically(inventories, (entry) => entry.name, i18n.language).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className={LABEL_CLASS}>
          {t("spools.manufacturer")}
          <select
            value={form.manufacturerId}
            onChange={(event) => handleManufacturerChange(event.target.value)}
            disabled={showNewManufacturer}
            className={SELECT_CLASS}
          >
            <option value="">{t("spools.selectManufacturer")}</option>
            {sortAlphabetically(manufacturers, (m) => m.name, i18n.language).map((manufacturer) => (
              <option key={manufacturer.id} value={manufacturer.id}>
                {manufacturer.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setShowNewManufacturer((value) => !value)}
          className="self-start text-xs font-medium text-[var(--accent)]"
        >
          {t("spools.newManufacturerToggle")}
        </button>

        {showNewManufacturer && (
          <input
            type="text"
            placeholder={t("spools.newManufacturerName")}
            value={newManufacturerName}
            onChange={(event) => setNewManufacturerName(event.target.value)}
            className={SMALL_INPUT_CLASS}
          />
        )}

        <label className={LABEL_CLASS}>
          {t("spools.material")}
          <select
            value={form.materialId}
            onChange={(event) => setForm({ ...form, materialId: event.target.value })}
            disabled={showNewMaterial || (!chosenManufacturerId && !showNewManufacturer)}
            className={SELECT_CLASS}
          >
            <option value="">
              {chosenManufacturerId || showNewManufacturer
                ? t("spools.selectMaterial")
                : t("spools.selectManufacturerFirst")}
            </option>
            {sortAlphabetically(availableMaterials, (m) => m.name, i18n.language).map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </label>

        {selectedMaterial && !showNewMaterial && (
          <p className="-mt-1 text-xs text-[var(--color-text-muted)]">
            {t("spools.tempHint", {
              min: selectedMaterial.printTempMinC,
              max: selectedMaterial.printTempMaxC
            })}
            {selectedBedTemp && ` · ${selectedBedTemp}`}
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowNewMaterial((value) => !value)}
          className="self-start text-xs font-medium text-[var(--accent)]"
        >
          {t("spools.newMaterialToggle")}
        </button>

        {showNewMaterial && (
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3">
            <input
              type="text"
              placeholder={t("spools.newMaterialName")}
              value={newMaterial.name}
              onChange={(event) => setNewMaterial({ ...newMaterial, name: event.target.value })}
              className={SMALL_INPUT_CLASS}
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={t("spools.newMaterialMinTemp")}
                value={newMaterial.printTempMinC}
                onChange={(event) =>
                  setNewMaterial({ ...newMaterial, printTempMinC: event.target.value })
                }
                className={`w-1/3 ${SMALL_INPUT_CLASS}`}
              />
              <input
                type="number"
                placeholder={t("spools.newMaterialMaxTemp")}
                value={newMaterial.printTempMaxC}
                onChange={(event) =>
                  setNewMaterial({ ...newMaterial, printTempMaxC: event.target.value })
                }
                className={`w-1/3 ${SMALL_INPUT_CLASS}`}
              />
              <input
                type="number"
                placeholder={t("spools.newMaterialBedTemp")}
                value={newMaterial.bedTempC}
                onChange={(event) => setNewMaterial({ ...newMaterial, bedTempC: event.target.value })}
                className={`w-1/3 ${SMALL_INPUT_CLASS}`}
              />
            </div>
          </div>
        )}

        <SpoolColorFields
          value={{ colorName: form.colorName, colorHex: form.colorHex, colorHex2: form.colorHex2 }}
          onChange={(value) => setForm({ ...form, ...value })}
          manufacturerName={showNewManufacturer ? null : (selectedManufacturer?.name ?? null)}
          materialName={showNewMaterial ? null : (selectedMaterial?.name ?? null)}
        />

        <div className="flex min-w-0 gap-2">
          <label className={`min-w-0 flex-1 ${LABEL_CLASS}`}>
            {t("spools.initialWeight")}
            <input
              type="number"
              min={1}
              value={form.initialWeightG}
              onChange={(event) => setForm({ ...form, initialWeightG: event.target.value })}
              className={`w-full ${SELECT_CLASS}`}
            />
          </label>
          <label className={`min-w-0 flex-1 ${LABEL_CLASS}`}>
            {t("spools.remainingWeight")}
            <input
              type="number"
              min={0}
              value={form.remainingWeightG}
              onChange={(event) => setForm({ ...form, remainingWeightG: event.target.value })}
              className={`w-full ${SELECT_CLASS}`}
            />
          </label>
        </div>

        <label className={LABEL_CLASS}>
          {t("spools.tareWeight")}
          <input
            type="number"
            min={0}
            value={form.tareWeightG}
            onChange={(event) => setForm({ ...form, tareWeightG: event.target.value })}
            className={SELECT_CLASS}
          />
        </label>

        <label className={LABEL_CLASS}>
          {t("spools.location")}
          <input
            type="text"
            value={form.location}
            onChange={(event) => setForm({ ...form, location: event.target.value })}
            className={SELECT_CLASS}
          />
        </label>

        {isUnopened && <SpoolPackagingField isRefill={isRefill} onChange={setIsRefill} />}

        <label className={LABEL_CLASS}>
          {t("spools.purchasePrice")}
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.purchasePriceEuro}
            onChange={(event) => {
              setPriceTouched(true);
              setForm({ ...form, purchasePriceEuro: event.target.value });
            }}
            className={SELECT_CLASS}
          />
          {!priceTouched && suggestedPrice && (
            <span className="text-xs font-normal text-[var(--color-text-muted)]">{t(`spools.priceHint.${suggestedPrice.source}`)}</span>
          )}
        </label>

        <label className={LABEL_CLASS}>
          {t("spools.note")}
          <textarea
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            rows={2}
            maxLength={500}
            className={SELECT_CLASS}
          />
        </label>

        {!initialSpool && (
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <input type="checkbox" checked={alreadyOpened} onChange={(event) => setAlreadyOpened(event.target.checked)} />
            {t("spools.alreadyOpened")}
          </label>
        )}

        <SpoolCustomFieldsFields definitions={customFieldDefinitions} values={customFields} onChange={setCustomFields} />

        {photoUploadEnabled && (
          <SpoolPhotoField currentUrl={initialSpool?.photoUrl ?? null} value={photo} onChange={setPhoto} />
        )}

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
