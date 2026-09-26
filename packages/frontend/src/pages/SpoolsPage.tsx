import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LOW_STOCK_THRESHOLD_RATIO } from "@filapilot/shared";
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
import { BambuImportModal } from "../components/BambuImportModal.js";
import type { BambuConnectionInfo, BambuSyncSummary } from "@filapilot/shared";
import { useCurrentInventory } from "../hooks/useCurrentInventory.js";
import { useInventoryStore } from "../stores/useInventoryStore.js";
import {
  fetchPhotoUploadEnabled,
  removeSpoolPhoto,
  uploadSpoolPhoto,
  type PhotoChange
} from "../lib/spoolPhoto.js";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { selectedId, isAll, canEdit, isOwner, inventory } = useCurrentInventory();
  const [connection, setConnection] = useState<BambuConnectionInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const inventories = useInventoryStore((state) => state.inventories);
  const editableInventories = inventories.filter((inventory) => inventory.role === "OWNER" || inventory.role === "EDITOR");
  const [photoUploadEnabled, setPhotoUploadEnabled] = useState(false);

  // silent: im Hintergrund nachladen, ohne die Seite (und einen offenen Dialog) durch die Ladeanzeige zu ersetzen
  const load = useCallback(async (silent = false) => {
    if (!selectedId) {
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const [spoolsData, materialsData, manufacturersData, photosEnabled] = await Promise.all([
        apiRequest<SpoolWithRelations[]>(`/spools?inventoryId=${selectedId}&archived=${showArchived ? "include" : "exclude"}`),
        apiRequest<Material[]>("/materials"),
        apiRequest<Manufacturer[]>("/manufacturers"),
        fetchPhotoUploadEnabled()
      ]);
      setPhotoUploadEnabled(photosEnabled);
      setSpools(spoolsData);
      setMaterials(materialsData);
      setManufacturers(manufacturersData);
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : t("spools.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, selectedId, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadConnection = useCallback(async () => {
    if (!selectedId || selectedId === "all") {
      setConnection(null);
      return;
    }
    try {
      setConnection(await apiRequest<BambuConnectionInfo>(`/inventories/${selectedId}/bambu-import/connection`));
    } catch {
      setConnection(null);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  async function handleSync(): Promise<void> {
    if (!selectedId) {
      return;
    }
    setSyncing(true);
    setSyncNotice(null);
    try {
      const result = await apiRequest<BambuSyncSummary>(`/inventories/${selectedId}/bambu-import/sync`, { method: "POST" });
      setSyncNotice(
        t("bambu.syncResult", { created: result.created, updated: result.updated, archived: result.archived, restored: result.restored }) +
          (result.archiveBlocked ? " " + t("bambu.syncBlocked") : "")
      );
      await load(true);
      await loadConnection();
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : t("bambu.failed"));
      await loadConnection();
    } finally {
      setSyncing(false);
    }
  }

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

  async function applyPhotoChange(spoolId: string, photo: PhotoChange): Promise<void> {
    try {
      if (photo.kind === "set") {
        await uploadSpoolPhoto(spoolId, photo.blob);
      } else if (photo.kind === "remove") {
        await removeSpoolPhoto(spoolId);
      }
    } catch (err) {
      // Die Spule ist bereits gespeichert - deshalb kein Fehler im Dialog, sondern ein Hinweis auf der Seite.
      setNotice(t("spools.photoFailed", { reason: err instanceof Error ? err.message : "" }));
    }
  }

  async function handleSubmitSpool(input: CreateSpoolInput, photo: PhotoChange): Promise<void> {
    setNotice(null);
    let spoolId: string;
    if (editingSpool) {
      spoolId = editingSpool.id;
      await apiRequest(`/spools/${spoolId}`, { method: "PATCH", body: JSON.stringify(input) });
    } else {
      const created = await apiRequest<{ id: string }>("/spools", {
        method: "POST",
        body: JSON.stringify(input)
      });
      spoolId = created.id;
    }
    await applyPhotoChange(spoolId, photo);
    setModalOpen(false);
    await load();
  }

  async function handleArchive(spool: SpoolWithRelations, archive: boolean): Promise<void> {
    await apiRequest(`/spools/${spool.id}/${archive ? "archive" : "unarchive"}`, { method: "POST" });
    await load(true);
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
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {connection?.connected && (
              <button
                type="button"
                disabled={syncing}
                onClick={() => void handleSync()}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {syncing ? t("bambu.syncing") : t("bambu.syncFromCloud")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
            >
              {t("bambu.open")}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {t("spools.addSpool")}
            </button>
          </div>
        )}
      </div>
      {isAll && <p className="text-sm text-[var(--color-text-secondary)]">{t("spools.allHint")}</p>}
      {syncNotice && <p className="text-sm text-[var(--color-text-secondary)]">{syncNotice}</p>}
      <label className="flex w-fit items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        {t("spools.showArchived")}
      </label>

      {notice && <p className="text-sm text-[var(--color-danger)]">{notice}</p>}

      {spools.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("spools.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spools.map((spool) => {
            const percent = Math.round((spool.remainingWeightG / spool.initialWeightG) * 100);
            const lowStock = spool.remainingWeightG / spool.initialWeightG <= LOW_STOCK_THRESHOLD_RATIO;
            const temps = materials.find((material) => material.id === spool.materialId);
            return (
              <div
                key={spool.id}
                className={`rounded-xl border border-[var(--color-border)] bg-white p-4 ${spool.archivedAt ? "opacity-70" : ""}`}
              >
                {spool.photoUrl && (
                  <img
                    src={spool.photoUrl}
                    alt=""
                    loading="lazy"
                    className="mb-3 h-32 w-full rounded-lg border border-[var(--color-border)] object-cover"
                  />
                )}
                <div className="mb-2 flex items-center gap-2">
                  <div
                    className="h-5 w-5 shrink-0 rounded-full border border-[var(--color-border)]"
                    style={{ backgroundColor: spool.colorHex ?? "#cccccc" }}
                    aria-hidden="true"
                  />
                  <div className="text-sm font-semibold">
                    {spool.materialName} {spool.colorName}
                  </div>
                  {spool.archivedAt && (
                    <span className="ml-auto shrink-0 rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                      {spool.archiveReason === "CLOUD_REMOVED" ? t("spools.archivedCloud") : t("spools.archived")}
                    </span>
                  )}
                  {lowStock && !spool.archivedAt && (
                    <span className="ml-auto shrink-0 rounded-full bg-[var(--color-danger)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-danger)]">
                      {t("spools.lowStock")}
                    </span>
                  )}
                </div>
                <div className="mb-2 text-xs text-[var(--color-text-muted)]">
                  {isAll && spool.inventoryName ? `${spool.inventoryName} · ` : ""}
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
                  {canEdit && (
                    <button type="button" onClick={() => openEdit(spool)} style={{ color: "var(--accent)" }}>
                      {t("common.edit")}
                    </button>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => void handleArchive(spool, !spool.archivedAt)} style={{ color: "var(--accent)" }}>
                      {spool.archivedAt ? t("spools.unarchive") : t("spools.archive")}
                    </button>
                  )}
                  <button type="button" onClick={() => setLabelSpool(spool)} style={{ color: "var(--accent)" }}>
                    {t("spools.qrLabel")}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(spool)}
                      className="text-[var(--color-danger)]"
                    >
                      {t("common.delete")}
                    </button>
                  )}
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
          photoUploadEnabled={photoUploadEnabled}
          inventories={editableInventories}
          defaultInventoryId={selectedId ?? ""}
          onSubmit={handleSubmitSpool}
        />
      )}

      {importOpen && selectedId && inventory && (
        <BambuImportModal
          inventoryId={selectedId}
          inventoryName={inventory.name}
          isOwner={isOwner}
          onConnectionChanged={() => void loadConnection()}
          onClose={() => setImportOpen(false)}
          onImported={() => void load(true)}
        />
      )}

      {labelSpool && <SpoolLabelModal spool={labelSpool} onClose={() => setLabelSpool(null)} />}
    </div>
  );
}
