import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  EMPTY_SPOOL_FILTER,
  LOW_STOCK_THRESHOLD_RATIO,
  filterSpools,
  isFilterActive,
  sortSpools,
  sortSpoolsByColumn,
  type SpoolColumnSort,
  type SpoolFilter,
  type SpoolSortColumn,
  type SpoolSortKey
} from "@filapilot/shared";
import type {
  CreateManufacturerInput,
  CreateMaterialInput,
  CreateSpoolInput,
  CustomFieldDefinition,
  Manufacturer,
  Material,
  SpoolWithRelations
} from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { downloadFile } from "../lib/download.js";
import { SpoolFormModal } from "../components/SpoolFormModal.js";
import { SpoolFilterBar } from "../components/SpoolFilterBar.js";
import { BambuSyncStatus } from "../components/BambuSyncStatus.js";
import { ListView } from "../components/SpoolListView.js";
import { CompactView, StandardView, SwatchView } from "../components/SpoolViews.js";
import { SpoolPager, SpoolViewSwitch } from "../components/SpoolViewControls.js";
import { useSpoolPreferences } from "../hooks/useSpoolPreferences.js";
import { SpoolLabelModal } from "../components/SpoolLabelModal.js";
import { SpoolHistoryModal } from "../components/SpoolHistoryModal.js";
import { SpoolDryingModal } from "../components/SpoolDryingModal.js";
import { SpoolWeighModal } from "../components/SpoolWeighModal.js";
import { BambuImportModal } from "../components/BambuImportModal.js";
import { SpoolmanImportModal } from "../components/SpoolmanImportModal.js";
import type { BambuConnectionInfo, BambuSyncSummary } from "@filapilot/shared";
import { useCurrentInventory } from "../hooks/useCurrentInventory.js";
import { useInventoryStore } from "../stores/useInventoryStore.js";
import {
  fetchSpoolFormDefaults,
  removeSpoolPhoto,
  uploadSpoolPhoto,
  type PhotoChange
} from "../lib/spoolPhoto.js";

export function SpoolsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  // Ein Link von aussen (z.B. "Braucht Aufmerksamkeit" auf dem Dashboard) kann einen Startfilter mitgeben
  // (location.state.presetFilter) - nur beim ersten Rendern gelesen, kein Zurueckschreiben in die History.
  const location = useLocation();
  const [filter, setFilterState] = useState<SpoolFilter>(() => {
    const preset = (location.state as { presetFilter?: Partial<SpoolFilter> } | null)?.presetFilter;
    return preset ? { ...EMPTY_SPOOL_FILTER, ...preset } : EMPTY_SPOOL_FILTER;
  });
  const setFilter = (next: SpoolFilter): void => {
    setFilterState(next);
    setPage(1);
  };
  const [sort, setSort] = useState<SpoolSortKey>("name");
  // Sortierung per Klick auf eine Spaltenueberschrift (nur Listenansicht); hat Vorrang vor dem Sortier-Dropdown.
  const [columnSort, setColumnSort] = useState<SpoolColumnSort | null>(null);
  const [page, setPage] = useState(1);
  const { view, pageSize, setView, setPageSize } = useSpoolPreferences();
  const activeColumnSort = view === "list" ? columnSort : null;
  const handleColumnSort = (column: SpoolSortColumn): void => {
    setColumnSort((current) => ({ column, direction: current?.column === column && current.direction === "asc" ? "desc" : "asc" }));
    setPage(1);
  };
  const [spools, setSpools] = useState<SpoolWithRelations[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [editingSpool, setEditingSpool] = useState<SpoolWithRelations | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [labelSpool, setLabelSpool] = useState<SpoolWithRelations | null>(null);
  const [historySpool, setHistorySpool] = useState<SpoolWithRelations | null>(null);
  const [dryingSpool, setDryingSpool] = useState<SpoolWithRelations | null>(null);
  const [weighSpool, setWeighSpool] = useState<SpoolWithRelations | null>(null);
  const [spoolmanImportOpen, setSpoolmanImportOpen] = useState(false);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { selectedId, isAll, canEdit, isOwner, inventory } = useCurrentInventory();
  const [connection, setConnection] = useState<BambuConnectionInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const inventories = useInventoryStore((state) => state.inventories);
  const editableInventories = inventories.filter((inventory) => inventory.role === "OWNER" || inventory.role === "EDITOR");
  const [photoUploadEnabled, setPhotoUploadEnabled] = useState(false);
  const [defaultManufacturerId, setDefaultManufacturerId] = useState<string | null>(null);

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
      const [spoolsData, materialsData, manufacturersData, customFieldsData, formDefaults] = await Promise.all([
        apiRequest<SpoolWithRelations[]>(`/spools?inventoryId=${selectedId}&archived=${showArchived ? "include" : "exclude"}`),
        apiRequest<Material[]>("/materials"),
        apiRequest<Manufacturer[]>("/manufacturers"),
        apiRequest<CustomFieldDefinition[]>("/custom-field-definitions"),
        fetchSpoolFormDefaults()
      ]);
      setPhotoUploadEnabled(formDefaults.photoUploadEnabled);
      setDefaultManufacturerId(formDefaults.defaultManufacturerId);
      setSpools(spoolsData);
      setMaterials(materialsData);
      setManufacturers(manufacturersData);
      setCustomFieldDefinitions(customFieldsData);
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

  async function handleExport(format: "csv" | "json" | "xlsx"): Promise<void> {
    if (!selectedId) {
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const archivedParam = showArchived ? "include" : "exclude";
      await downloadFile(
        `/spools/export?inventoryId=${selectedId}&archived=${archivedParam}&format=${format}`,
        `filapilot-spulen.${format}`
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("spools.export.failed"));
    } finally {
      setExporting(false);
    }
  }

  async function handleAddToWishlist(spool: SpoolWithRelations): Promise<void> {
    setActionNotice(null);
    try {
      await apiRequest("/wishlist", {
        method: "POST",
        body: JSON.stringify({
          title: `${spool.manufacturerName} ${spool.materialName} ${spool.colorName}`,
          manufacturerId: spool.manufacturerId,
          materialId: spool.materialId
        })
      });
      setActionNotice(t("spools.addedToWishlist"));
    } catch (err) {
      setActionNotice(err instanceof ApiRequestError ? err.message : t("spools.addToWishlistFailed"));
    }
  }

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

  async function handleMarkOpened(spool: SpoolWithRelations): Promise<void> {
    try {
      await apiRequest(`/spools/${spool.id}/mark-opened`, { method: "POST" });
      await load(true);
    } catch (err) {
      setActionNotice(err instanceof ApiRequestError ? err.message : t("spools.markOpenedFailed"));
    }
  }

  async function handleDelete(spool: SpoolWithRelations): Promise<void> {
    if (!window.confirm(t("spools.confirmDelete"))) {
      return;
    }
    await apiRequest(`/spools/${spool.id}`, { method: "DELETE" });
    await load();
  }

  // Ungeoeffnete Spulen zuerst geclustert (innerhalb jeder Gruppe bleibt die gewaehlte Sortierung erhalten) -
  // Grundlage fuer die zwei Abschnitte "Ungeoeffnet"/"Angefangen" im Standard-Bestand.
  // Mit aktiver Spaltensortierung entfaellt die Clusterung, damit die Reihenfolge der Spalte durchgehend gilt.
  const visibleSpools = useMemo(() => {
    const filtered = filterSpools(spools, filter, LOW_STOCK_THRESHOLD_RATIO);
    if (activeColumnSort) {
      return sortSpoolsByColumn(sortSpools(filtered, sort, i18n.language), activeColumnSort, i18n.language, materials);
    }
    const sorted = sortSpools(filtered, sort, i18n.language);
    return [...sorted.filter((spool) => !spool.openedAt), ...sorted.filter((spool) => spool.openedAt)];
  }, [spools, filter, sort, activeColumnSort, materials, i18n.language]);
  const unopenedVisible = visibleSpools.filter((spool) => !spool.openedAt);
  const startedVisible = visibleSpools.filter((spool) => spool.openedAt);
  const showOpenedGroups = !activeColumnSort && unopenedVisible.length > 0 && startedVisible.length > 0;
  let emptyText = "";
  if (spools.length === 0) {
    emptyText = t("spools.empty");
  } else if (visibleSpools.length === 0) {
    emptyText = t("spools.filter.noMatch");
  }
  // Seitenweise anzeigen (0 = alle); bei geaenderten Filtern zurueck auf Seite 1
  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(visibleSpools.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedSpools = pageSize === 0 ? visibleSpools : visibleSpools.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const SpoolViewComponent = { standard: StandardView, compact: CompactView, list: ListView, swatch: SwatchView }[view];
  const renderSpoolView = (viewSpools: SpoolWithRelations[]): React.JSX.Element => (
    <SpoolViewComponent
      spools={viewSpools}
      materials={materials}
      customFieldDefinitions={customFieldDefinitions}
      isAll={isAll}
      columnSort={activeColumnSort}
      onColumnSort={handleColumnSort}
      canEdit={canEdit}
      onEdit={openEdit}
      onArchive={(spool, archive) => void handleArchive(spool, archive)}
      onLabel={setLabelSpool}
      onHistory={setHistorySpool}
      onDrying={setDryingSpool}
      onWeigh={setWeighSpool}
      onMarkOpened={(spool) => void handleMarkOpened(spool)}
      onAddToWishlist={(spool) => void handleAddToWishlist(spool)}
      onDelete={(spool) => void handleDelete(spool)}
    />
  );
  const archivedCount = spools.filter((spool) => spool.archivedAt).length;
  const totalRemainingG = visibleSpools.reduce((sum, spool) => sum + spool.remainingWeightG, 0);
  const formatWeight = (grams: number): string =>
    grams >= 1000 ? `${(grams / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 2 })} kg` : `${grams.toLocaleString(i18n.language)} g`;

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              onClick={() => setSpoolmanImportOpen(true)}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
            >
              {t("spoolman.open")}
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
      {connection && <BambuSyncStatus info={connection} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex w-fit items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          {t("spools.showArchived")}
        </label>
        <div className="flex items-center gap-3">
          {selectedId && (
            <span className="text-xs text-[var(--color-text-muted)]">
              {t("spools.export.label")}{" "}
              {(["xlsx", "csv", "json"] as const).map((format, index) => (
                <span key={format}>
                  {index > 0 && " · "}
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void handleExport(format)}
                    className="font-medium disabled:opacity-60"
                    style={{ color: "var(--accent)" }}
                  >
                    {t(`spools.export.${format}`)}
                  </button>
                </span>
              ))}
            </span>
          )}
          <SpoolViewSwitch view={view} onChange={setView} />
        </div>
      </div>
      {exportError && <p className="text-sm text-[var(--color-danger)]">{exportError}</p>}
      {actionNotice && <p className="text-sm text-[var(--color-text-secondary)]">{actionNotice}</p>}

      {notice && <p className="text-sm text-[var(--color-danger)]">{notice}</p>}

      {spools.length > 0 && (
        <>
          <SpoolFilterBar spools={spools} filter={filter} sort={sort} onFilterChange={setFilter} onSortChange={(next) => {
              setSort(next);
              setColumnSort(null);
              setPage(1);
            }}
          />
          <p className="text-sm text-[var(--color-text-secondary)]">
            {isFilterActive(filter)
              ? t("spools.filter.countSome", { shown: visibleSpools.length, total: spools.length })
              : t("spools.filter.countAll", { count: spools.length })}
            {showArchived && archivedCount > 0 ? ` (${t("spools.filter.archivedPart", { count: archivedCount })})` : ""}
            {" · "}
            {t("spools.filter.remainingTotal", { weight: formatWeight(totalRemainingG) })}
          </p>
        </>
      )}

      {emptyText ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{emptyText}</p>
      ) : (
        <>
          {showOpenedGroups
            ? ([
                ["unopened", unopenedVisible] as const,
                ["started", startedVisible] as const
              ] as const).map(([key, groupSpools]) => {
                const pageIds = new Set(pagedSpools.map((spool) => spool.id));
                const onPage = groupSpools.filter((spool) => pageIds.has(spool.id));
                if (onPage.length === 0) {
                  return null;
                }
                const weight = groupSpools.reduce((sum, spool) => sum + spool.remainingWeightG, 0);
                return (
                  <div key={key} className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-sm font-semibold" style={key === "unopened" ? { color: "var(--accent)" } : undefined}>
                        {t(`spools.groups.${key}`)}
                      </h3>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {t("spools.groups.summary", { count: groupSpools.length, weight: formatWeight(weight) })}
                      </span>
                    </div>
                    {renderSpoolView(onPage)}
                  </div>
                );
              })
            : renderSpoolView(pagedSpools)}
          <SpoolPager page={currentPage} pageCount={pageCount} pageSize={pageSize} total={visibleSpools.length} onPage={setPage} onPageSize={setPageSize} />
        </>
      )}

      {modalOpen && (
        <SpoolFormModal
          materials={materials}
          manufacturers={manufacturers}
          customFieldDefinitions={customFieldDefinitions}
          initialSpool={editingSpool}
          onClose={() => setModalOpen(false)}
          onCreateMaterial={handleCreateMaterial}
          onCreateManufacturer={handleCreateManufacturer}
          photoUploadEnabled={photoUploadEnabled}
          inventories={editableInventories}
          defaultInventoryId={selectedId ?? ""}
          defaultManufacturerId={defaultManufacturerId}
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

      {spoolmanImportOpen && selectedId && inventory && (
        <SpoolmanImportModal
          inventoryId={selectedId}
          inventoryName={inventory.name}
          onClose={() => setSpoolmanImportOpen(false)}
          onImported={() => void load(true)}
        />
      )}

      {labelSpool && <SpoolLabelModal spool={labelSpool} onClose={() => setLabelSpool(null)} />}
      {historySpool && <SpoolHistoryModal spool={historySpool} onClose={() => setHistorySpool(null)} />}
      {dryingSpool && (
        <SpoolDryingModal
          spool={dryingSpool}
          onClose={() => setDryingSpool(null)}
          onLogged={() => setActionNotice(t("spools.drying.logged"))}
        />
      )}
      {weighSpool && (
        <SpoolWeighModal
          spool={weighSpool}
          onClose={() => setWeighSpool(null)}
          onWeighed={() => {
            setActionNotice(t("spools.weigh.logged"));
            void load(true);
          }}
        />
      )}
    </div>
  );
}
