import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Manufacturer, Material } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

const INPUT_CLASS =
  "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";
const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";
const ALL = "__all__";
const GENERIC = "__generic__";

function Card({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-5">
      <h3 className="text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
}

function ModalForm({
  title,
  error,
  submitting,
  onClose,
  onSubmit,
  children
}: {
  title: string;
  error: string | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90dvh] w-full max-w-[380px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
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

function RowActions({
  onEdit,
  onDelete
}: {
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-3 text-xs font-medium">
      <button type="button" onClick={onEdit} style={{ color: "var(--accent)" }}>
        {t("common.edit")}
      </button>
      <button type="button" onClick={onDelete} className="text-[var(--color-danger)]">
        {t("common.delete")}
      </button>
    </div>
  );
}

function ManufacturerModal({
  initial,
  onClose,
  onSaved
}: {
  initial: Manufacturer | null;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function save(): Promise<void> {
    if (!name.trim()) {
      setError(t("catalog.nameRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(initial ? `/manufacturers/${initial.id}` : "/manufacturers", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify({ name: name.trim() })
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("settings.saveFailed"));
      setSubmitting(false);
    }
  }

  return (
    <ModalForm
      title={initial ? t("catalog.editManufacturer") : t("catalog.newManufacturer")}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={() => void save()}
    >
      <label className={LABEL_CLASS}>
        {t("catalog.name")}
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
      </label>
    </ModalForm>
  );
}

function MaterialModal({
  initial,
  manufacturers,
  defaultManufacturerId,
  onClose,
  onSaved
}: {
  initial: Material | null;
  manufacturers: Manufacturer[];
  defaultManufacturerId: string;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [manufacturerId, setManufacturerId] = useState(
    initial ? (initial.manufacturerId ?? "") : defaultManufacturerId
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [minC, setMinC] = useState(initial ? String(initial.printTempMinC) : "");
  const [maxC, setMaxC] = useState(initial ? String(initial.printTempMaxC) : "");
  const [bedC, setBedC] = useState(initial?.bedTempC != null ? String(initial.bedTempC) : "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function save(): Promise<void> {
    if (!name.trim() || !minC || !maxC) {
      setError(t("catalog.materialFieldsRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(initial ? `/materials/${initial.id}` : "/materials", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify({
          name: name.trim(),
          manufacturerId: manufacturerId || null,
          printTempMinC: Number(minC),
          printTempMaxC: Number(maxC),
          bedTempC: bedC ? Number(bedC) : null
        })
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("settings.saveFailed"));
      setSubmitting(false);
    }
  }

  return (
    <ModalForm
      title={initial ? t("catalog.editMaterial") : t("catalog.newMaterial")}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={() => void save()}
    >
      <label className={LABEL_CLASS}>
        {t("spools.manufacturer")}
        <select value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)} className={INPUT_CLASS}>
          <option value="">{t("catalog.generic")}</option>
          {sortAlphabetically(manufacturers, (m) => m.name, i18n.language).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL_CLASS}>
        {t("catalog.name")}
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
      </label>
      <div className="flex gap-2">
        <label className={`min-w-0 flex-1 ${LABEL_CLASS}`}>
          {t("catalog.nozzleMin")}
          <input type="number" value={minC} onChange={(e) => setMinC(e.target.value)} className={INPUT_CLASS} />
        </label>
        <label className={`min-w-0 flex-1 ${LABEL_CLASS}`}>
          {t("catalog.nozzleMax")}
          <input type="number" value={maxC} onChange={(e) => setMaxC(e.target.value)} className={INPUT_CLASS} />
        </label>
        <label className={`min-w-0 flex-1 ${LABEL_CLASS}`}>
          {t("catalog.bed")}
          <input type="number" value={bedC} onChange={(e) => setBedC(e.target.value)} className={INPUT_CLASS} />
        </label>
      </div>
    </ModalForm>
  );
}

export function CatalogSection(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [manufacturers, setManufacturers] = useState<Manufacturer[] | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [filter, setFilter] = useState(ALL);
  const [message, setMessage] = useState<string | null>(null);
  const [manufacturerModal, setManufacturerModal] = useState<Manufacturer | "new" | null>(null);
  const [materialModal, setMaterialModal] = useState<Material | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const [manufacturerData, materialData] = await Promise.all([
        apiRequest<Manufacturer[]>("/manufacturers"),
        apiRequest<Material[]>("/materials")
      ]);
      setManufacturers(manufacturerData);
      setMaterials(materialData);
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : t("catalog.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(path: string, confirmText: string): Promise<void> {
    if (!window.confirm(confirmText)) {
      return;
    }
    setMessage(null);
    try {
      await apiRequest(path, { method: "DELETE" });
      await load();
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : t("catalog.deleteFailed"));
    }
  }

  function saved(): void {
    setManufacturerModal(null);
    setMaterialModal(null);
    setMessage(null);
    void load();
  }

  if (!manufacturers || !materials) {
    return <Card title={t("catalog.title")}>{message ?? t("common.loading")}</Card>;
  }

  const nameOfManufacturer = (id: string | null): string =>
    id === null ? t("catalog.generic") : (manufacturers.find((m) => m.id === id)?.name ?? "?");
  const shownMaterials = materials
    .filter((m) => filter === ALL || (filter === GENERIC ? m.manufacturerId === null : m.manufacturerId === filter))
    .sort(
      (a, b) =>
        (a.manufacturerId === null ? -1 : 0) - (b.manufacturerId === null ? -1 : 0) ||
        nameOfManufacturer(a.manufacturerId).localeCompare(nameOfManufacturer(b.manufacturerId), i18n.language) ||
        a.name.localeCompare(b.name, i18n.language, { numeric: true })
    );

  return (
    <>
      {message && <p className="text-sm text-[var(--color-danger)]">{message}</p>}
      <Card title={t("catalog.manufacturers")}>
        <div className="overflow-x-auto">
<table className="w-full text-left text-sm">
          <tbody>
            {sortAlphabetically(manufacturers, (m) => m.name, i18n.language).map((m) => (
              <tr key={m.id} className="border-t border-[var(--color-border)] first:border-t-0">
                <td className="py-2">{m.name}</td>
                <td className="py-2">
                  <RowActions
                    onEdit={() => setManufacturerModal(m)}
                    onDelete={() =>
                      void remove(`/manufacturers/${m.id}`, t("catalog.confirmDeleteManufacturer", { name: m.name }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
        <button
          type="button"
          onClick={() => setManufacturerModal("new")}
          className="w-fit rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
        >
          {t("catalog.newManufacturer")}
        </button>
      </Card>

      <Card title={t("catalog.materials")}>
        <label className={LABEL_CLASS}>
          {t("catalog.filter")}
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={INPUT_CLASS}>
            <option value={ALL}>{t("catalog.all")}</option>
            <option value={GENERIC}>{t("catalog.generic")}</option>
            {sortAlphabetically(manufacturers, (m) => m.name, i18n.language).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="overflow-x-auto">
<table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-xs text-[var(--color-text-muted)]">
              <th className="pb-2 font-medium">{t("catalog.name")}</th>
              <th className="pb-2 font-medium">{t("spools.manufacturer")}</th>
              <th className="pb-2 font-medium">{t("catalog.temps")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shownMaterials.map((m) => (
              <tr key={m.id} className="border-t border-[var(--color-border)]">
                <td className="py-2">{m.name}</td>
                <td className="py-2 text-[var(--color-text-secondary)]">{nameOfManufacturer(m.manufacturerId)}</td>
                <td className="py-2 text-[var(--color-text-secondary)]">
                  {m.printTempMinC}–{m.printTempMaxC} °C{m.bedTempC !== null ? ` · ${m.bedTempC} °C` : ""}
                </td>
                <td className="py-2">
                  <RowActions
                    onEdit={() => setMaterialModal(m)}
                    onDelete={() =>
                      void remove(`/materials/${m.id}`, t("catalog.confirmDeleteMaterial", { name: m.name }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
        <p className="text-xs text-[var(--color-text-muted)]">{t("catalog.tempsHint")}</p>
        <button
          type="button"
          onClick={() => setMaterialModal("new")}
          className="w-fit rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
        >
          {t("catalog.newMaterial")}
        </button>
      </Card>

      {manufacturerModal && (
        <ManufacturerModal
          initial={manufacturerModal === "new" ? null : manufacturerModal}
          onClose={() => setManufacturerModal(null)}
          onSaved={saved}
        />
      )}
      {materialModal && (
        <MaterialModal
          initial={materialModal === "new" ? null : materialModal}
          manufacturers={manufacturers}
          defaultManufacturerId={filter === ALL || filter === GENERIC ? "" : filter}
          onClose={() => setMaterialModal(null)}
          onSaved={saved}
        />
      )}
    </>
  );
}
