import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CreateMaterialInput, CreateSpoolInput, Material, SpoolWithMaterial } from "@filapilot/shared";

interface SpoolFormModalProps {
  materials: Material[];
  initialSpool: SpoolWithMaterial | null;
  onClose: () => void;
  onCreateMaterial: (input: CreateMaterialInput) => Promise<Material>;
  onSubmit: (input: CreateSpoolInput) => Promise<void>;
}

function toFormState(spool: SpoolWithMaterial | null) {
  return {
    materialId: spool?.materialId ?? "",
    manufacturer: spool?.manufacturer ?? "",
    colorName: spool?.colorName ?? "",
    colorHex: spool?.colorHex ?? "",
    initialWeightG: spool ? String(spool.initialWeightG) : "1000",
    remainingWeightG: spool ? String(spool.remainingWeightG) : "1000",
    location: spool?.location ?? "",
    purchasePriceEuro: spool?.purchasePriceCents != null ? String(spool.purchasePriceCents / 100) : ""
  };
}

export function SpoolFormModal({
  materials,
  initialSpool,
  onClose,
  onCreateMaterial,
  onSubmit
}: SpoolFormModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const [form, setForm] = useState(toFormState(initialSpool));
  const [showNewMaterial, setShowNewMaterial] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: "", printTempMinC: "", printTempMaxC: "" });
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    let materialId = form.materialId;
    setSubmitting(true);
    try {
      if (showNewMaterial) {
        if (!newMaterial.name.trim()) {
          setError(t("spools.newMaterialName"));
          setSubmitting(false);
          return;
        }
        const created = await onCreateMaterial({
          name: newMaterial.name.trim(),
          printTempMinC: Number(newMaterial.printTempMinC) || 0,
          printTempMaxC: Number(newMaterial.printTempMaxC) || 0,
          bedTempC: null
        });
        materialId = created.id;
      }

      if (!materialId || !form.manufacturer.trim() || !form.colorName.trim()) {
        setError("Bitte alle Pflichtfelder ausfüllen.");
        setSubmitting(false);
        return;
      }

      await onSubmit({
        materialId,
        manufacturer: form.manufacturer.trim(),
        colorName: form.colorName.trim(),
        colorHex: form.colorHex.trim() ? form.colorHex.trim() : null,
        initialWeightG: Number(form.initialWeightG),
        remainingWeightG: Number(form.remainingWeightG),
        photoUrl: null,
        purchasePriceCents: form.purchasePriceEuro.trim()
          ? Math.round(Number(form.purchasePriceEuro) * 100)
          : null,
        purchasedAt: null,
        location: form.location.trim() ? form.location.trim() : null
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex max-h-[90vh] w-[420px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">
          {initialSpool ? t("spools.editSpool") : t("spools.addSpool")}
        </h2>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("spools.material")}
          <select
            value={form.materialId}
            onChange={(event) => setForm({ ...form, materialId: event.target.value })}
            disabled={showNewMaterial}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          >
            <option value="">{t("spools.selectMaterial")}</option>
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </label>

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
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={t("spools.newMaterialMinTemp")}
                value={newMaterial.printTempMinC}
                onChange={(event) =>
                  setNewMaterial({ ...newMaterial, printTempMinC: event.target.value })
                }
                className="w-1/2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder={t("spools.newMaterialMaxTemp")}
                value={newMaterial.printTempMaxC}
                onChange={(event) =>
                  setNewMaterial({ ...newMaterial, printTempMaxC: event.target.value })
                }
                className="w-1/2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("spools.manufacturer")}
          <input
            type="text"
            value={form.manufacturer}
            onChange={(event) => setForm({ ...form, manufacturer: event.target.value })}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          />
        </label>

        <div className="flex min-w-0 gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
            {t("spools.colorName")}
            <input
              type="text"
              value={form.colorName}
              onChange={(event) => setForm({ ...form, colorName: event.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
            />
          </label>
          <label className="flex w-28 shrink-0 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
            {t("spools.colorHex")}
            <input
              type="text"
              placeholder="#000000"
              value={form.colorHex}
              onChange={(event) => setForm({ ...form, colorHex: event.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
            />
          </label>
        </div>

        <div className="flex min-w-0 gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
            {t("spools.initialWeight")}
            <input
              type="number"
              min={1}
              value={form.initialWeightG}
              onChange={(event) => setForm({ ...form, initialWeightG: event.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
            {t("spools.remainingWeight")}
            <input
              type="number"
              min={0}
              value={form.remainingWeightG}
              onChange={(event) => setForm({ ...form, remainingWeightG: event.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("spools.location")}
          <input
            type="text"
            value={form.location}
            onChange={(event) => setForm({ ...form, location: event.target.value })}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("spools.purchasePrice")}
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.purchasePriceEuro}
            onChange={(event) => setForm({ ...form, purchasePriceEuro: event.target.value })}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          />
        </label>

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
