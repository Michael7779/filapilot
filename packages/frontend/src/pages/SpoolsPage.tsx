import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  CreateManufacturerInput,
  CreateMaterialInput,
  CreateSpoolInput,
  Manufacturer,
  Material,
  SpoolWithRelations
} from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { SpoolFormModal } from "../components/SpoolFormModal.js";
import { SpoolLabelModal } from "../components/SpoolLabelModal.js";

export function SpoolsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [spools, setSpools] = useState<SpoolWithRelations[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [editingSpool, setEditingSpool] = useState<SpoolWithRelations | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [labelSpool, setLabelSpool] = useState<SpoolWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [spoolsData, materialsData, manufacturersData] = await Promise.all([
        apiRequest<SpoolWithRelations[]>("/spools"),
        apiRequest<Material[]>("/materials"),
        apiRequest<Manufacturer[]>("/manufacturers")
      ]);
      setSpools(spoolsData);
      setMaterials(materialsData);
      setManufacturers(manufacturersData);
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : t("spools.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate(): void {
    setEditingSpool(null);
    setModalOpen(true);
  }

  function openEdit(spool: SpoolWithRelations): void {
    setEditingSpool(spool);
    setModalOpen(true);
  }

  async function handleCreateMaterial(input: CreateMaterialInput): Promise<Material> {
    const created = await apiRequest<Material>("/materials", {
      method: "POST",
      body: JSON.stringify(input)
    });
    setMaterials((current) => [...current, created]);
    return created;
  }

  async function handleCreateManufacturer(input: CreateManufacturerInput): Promise<Manufacturer> {
    const created = await apiRequest<Manufacturer>("/manufacturers", {
      method: "POST",
      body: JSON.stringify(input)
    });
    setManufacturers((current) => [...current, created]);
    return created;
  }

  async function handleSubmitSpool(input: CreateSpoolInput): Promise<void> {
    if (editingSpool) {
      await apiRequest(`/spools/${editingSpool.id}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
    } else {
      await apiRequest("/spools", { method: "POST", body: JSON.stringify(input) });
    }
    setModalOpen(false);
    await load();
  }

  async function handleDelete(spool: SpoolWithRelations): Promise<void> {
    if (!window.confirm(t("spools.confirmDelete"))) {
      return;
    }
    await apiRequest(`/spools/${spool.id}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return <div>{t("common.loading")}</div>;
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-[var(--color-danger)]">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t("spools.title")}</h2>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {t("spools.addSpool")}
        </button>
      </div>

      {spools.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("spools.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spools.map((spool) => {
            const percent = Math.round((spool.remainingWeightG / spool.initialWeightG) * 100);
            const temps = materials.find((material) => material.id === spool.materialId);
            return (
              <div
                key={spool.id}
                className="rounded-xl border border-[var(--color-border)] bg-white p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div
                    className="h-5 w-5 shrink-0 rounded-full border border-[var(--color-border)]"
                    style={{ backgroundColor: spool.colorHex ?? "#cccccc" }}
                    aria-hidden="true"
                  />
                  <div className="text-sm font-semibold">
                    {spool.materialName} {spool.colorName}
                  </div>
                </div>
                <div className="mb-2 text-xs text-[var(--color-text-muted)]">
                  {spool.manufacturerName}
                  {spool.location ? ` · ${spool.location}` : ""}
                </div>
                {temps && (
                  <div className="mb-2 text-xs text-[var(--color-text-muted)]">
                    {t("spools.tempHint", { min: temps.printTempMinC, max: temps.printTempMaxC })}
                    {temps.bedTempC !== null &&
                      ` · ${t("spools.bedTempHint", { bed: temps.bedTempC })}`}
                  </div>
                )}
                <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${percent}%`, backgroundColor: "var(--accent)" }}
                  />
                </div>
                <div className="mb-3 text-xs text-[var(--color-text-secondary)]">
                  {spool.remainingWeightG} g / {spool.initialWeightG} g
                </div>
                <div className="flex gap-2 text-xs font-medium">
                  <button type="button" onClick={() => openEdit(spool)} style={{ color: "var(--accent)" }}>
                    {t("common.edit")}
                  </button>
                  <button type="button" onClick={() => setLabelSpool(spool)} style={{ color: "var(--accent)" }}>
                    {t("spools.qrLabel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(spool)}
                    className="text-[var(--color-danger)]"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <SpoolFormModal
          materials={materials}
          manufacturers={manufacturers}
          initialSpool={editingSpool}
          onClose={() => setModalOpen(false)}
          onCreateMaterial={handleCreateMaterial}
          onCreateManufacturer={handleCreateManufacturer}
          onSubmit={handleSubmitSpool}
        />
      )}

      {labelSpool && <SpoolLabelModal spool={labelSpool} onClose={() => setLabelSpool(null)} />}
    </div>
  );
}
