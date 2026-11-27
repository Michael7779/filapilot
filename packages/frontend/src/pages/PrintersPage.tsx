import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PrinterPublic } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { usePrinterStatuses } from "../hooks/usePrinterStatuses.js";
import { useCurrentInventory } from "../hooks/useCurrentInventory.js";
import { PrinterCard } from "../components/PrinterCard.js";
import { NewPrinterModal } from "../components/NewPrinterModal.js";
import { PrinterMoveModal } from "../components/PrinterMoveModal.js";
import { PrinterConnectionModal } from "../components/PrinterConnectionModal.js";
import { useInventoryStore } from "../stores/useInventoryStore.js";

function MqttSetupGuide(): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm font-semibold"
        style={{ color: "var(--accent)" }}
      >
        {open ? t("printers.hideGuide") : t("printers.showGuide")}
      </button>
      {open && <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{t("printers.guideCloudNote")}</p>}
      {open && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--color-text-secondary)]">
          <li>{t("printers.guideStep1")}</li>
          <li>{t("printers.guideStep2")}</li>
          <li>{t("printers.guideStep3")}</li>
          <li>{t("printers.guideStep4")}</li>
          <li>{t("printers.guideStep5")}</li>
        </ol>
      )}
    </div>
  );
}

export function PrintersPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { selectedId, isAll, isOwner, canEdit } = useCurrentInventory();
  const inventories = useInventoryStore((state) => state.inventories);
  const [printers, setPrinters] = useState<PrinterPublic[]>([]);
  const { statusByPrinter, refreshStatuses } = usePrinterStatuses(printers);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [movingPrinter, setMovingPrinter] = useState<PrinterPublic | null>(null);
  const [connectionPrinter, setConnectionPrinter] = useState<PrinterPublic | null>(null);

  const load = useCallback(async () => {
    if (!selectedId) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<PrinterPublic[]>(`/printers?inventoryId=${selectedId}`);
      setPrinters(data);
      await refreshStatuses(data);
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : t("printers.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, selectedId, refreshStatuses]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleCreated(printer: PrinterPublic): void {
    setModalOpen(false);
    setPrinters((current) => [...current, printer]);
    // Status gleich holen: ein Cloud-Drucker zeigt so sofort, wenn z.B. die Bambu-Verbindung des Lagers fehlt.
    refreshStatuses([printer]).catch((error: unknown) => {
      console.error("Druckerstatus konnte nicht geladen werden", error);
    });
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
        <h2 className="text-lg font-bold">{t("nav.printers")}</h2>
        {isOwner && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {t("printers.newPrinter")}
          </button>
        )}
      </div>

      <MqttSetupGuide />

      {printers.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("printers.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {printers.map((printer) => (
            <div key={printer.id} className="flex flex-col gap-1">
              {isAll && (
                <span className="text-xs font-medium text-[var(--color-text-muted)]">
                  {inventories.find((inventory) => inventory.id === printer.inventoryId)?.name ?? ""}
                </span>
              )}
              <PrinterCard
                printer={printer}
                status={statusByPrinter[printer.id]}
                canEdit={canEdit}
                {...(inventories.find((inventory) => inventory.id === printer.inventoryId)?.role ===
                "OWNER"
                  ? {
                      onMove: () => setMovingPrinter(printer),
                      onChangeConnection: () => setConnectionPrinter(printer)
                    }
                  : {})}
              />
            </div>
          ))}
        </div>
      )}

      {connectionPrinter && (
        <PrinterConnectionModal
          printer={connectionPrinter}
          onClose={() => setConnectionPrinter(null)}
          onChanged={() => {
            setConnectionPrinter(null);
            void load();
          }}
        />
      )}

      {movingPrinter && (
        <PrinterMoveModal
          printer={movingPrinter}
          onClose={() => setMovingPrinter(null)}
          onMoved={() => {
            setMovingPrinter(null);
            void load();
          }}
        />
      )}

      {modalOpen && selectedId && !isAll && (
        <NewPrinterModal inventoryId={selectedId} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
