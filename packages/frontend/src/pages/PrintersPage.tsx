import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import type { CreatePrinterInput, PrinterLiveStatus, PrinterPublic } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";
import { useCurrentInventory } from "../hooks/useCurrentInventory.js";
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

function NewPrinterModal({
  inventoryId,
  onClose,
  onCreated
}: {
  inventoryId: string;
  onClose: () => void;
  onCreated: (printer: PrinterPublic) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [syncMode, setSyncMode] = useState<"LIVE" | "PERIODIC">("LIVE");
  const [syncIntervalSeconds, setSyncIntervalSeconds] = useState("60");
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
    if (!name.trim() || !ipAddress.trim() || !serialNumber.trim() || !accessCode.trim()) {
      setError(t("printers.fieldsRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const input: CreatePrinterInput = {
        name: name.trim(),
        ipAddress: ipAddress.trim(),
        serialNumber: serialNumber.trim(),
        accessCode: accessCode.trim(),
        syncMode,
        syncIntervalSeconds: Number(syncIntervalSeconds),
        inventoryId
      };
      const created = await apiRequest<PrinterPublic>("/printers", {
        method: "POST",
        body: JSON.stringify(input)
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("printers.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex max-h-[90dvh] w-full max-w-[380px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{t("printers.newPrinter")}</h2>
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("printers.name")}
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("printers.ipAddress")}
          <input
            type="text"
            // eslint-disable-next-line sonarjs/no-hardcoded-ip -- Beispiel-Platzhalter im Eingabefeld, kein echtes Ziel
            placeholder="192.168.1.42"
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("printers.serialNumber")}
          <input
            type="text"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("printers.accessCode")}
          <input
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("printers.syncMode")}
          <select
            value={syncMode}
            onChange={(e) => setSyncMode(e.target.value as "LIVE" | "PERIODIC")}
            className={inputClass}
          >
            {sortAlphabetically(
              [
                { value: "LIVE", label: t("printers.syncModeLive") },
                { value: "PERIODIC", label: t("printers.syncModePeriodic") }
              ],
              (option) => option.label,
              i18n.language
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {syncMode === "PERIODIC" && (
          <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
            {t("printers.syncInterval")}
            <input
              type="number"
              min={10}
              max={3600}
              value={syncIntervalSeconds}
              onChange={(e) => setSyncIntervalSeconds(e.target.value)}
              className={inputClass}
            />
          </label>
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

function PrinterCard({
  printer,
  status
}: {
  printer: PrinterPublic;
  status: PrinterLiveStatus | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const connected = status?.connected ?? false;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{printer.name}</div>
          <div className="text-xs text-[var(--color-text-muted)]">{printer.ipAddress}</div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={
            connected
              ? { backgroundColor: "var(--color-success)", color: "#fff" }
              : { backgroundColor: "var(--color-bg)", color: "var(--color-text-muted)" }
          }
        >
          {connected ? t("printers.connected") : t("printers.disconnected")}
        </span>
      </div>
      {status?.printing && (
        <div className="mb-2">
          <div className="mb-1 text-xs text-[var(--color-text-secondary)]">
            {status.currentJobName ?? t("printers.printing")}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${status.progressPercent ?? 0}%`,
                backgroundColor: "var(--accent)"
              }}
            />
          </div>
        </div>
      )}
      <div className="text-xs text-[var(--color-text-muted)]">
        {t("printers.syncMode")}:{" "}
        {printer.syncMode === "LIVE" ? t("printers.syncModeLive") : t("printers.syncModePeriodic")}
      </div>
    </div>
  );
}

export function PrintersPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { selectedId, isAll, isOwner } = useCurrentInventory();
  const inventories = useInventoryStore((state) => state.inventories);
  const [printers, setPrinters] = useState<PrinterPublic[]>([]);
  const [statusByPrinter, setStatusByPrinter] = useState<Record<string, PrinterLiveStatus>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!selectedId) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<PrinterPublic[]>(`/printers?inventoryId=${selectedId}`);
      setPrinters(data);
      const statuses = await Promise.all(
        data.map((printer) => apiRequest<PrinterLiveStatus>(`/printers/${printer.id}/status`))
      );
      setStatusByPrinter(Object.fromEntries(statuses.map((s) => [s.printerId, s])));
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : t("printers.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    function handleStatus(status: PrinterLiveStatus): void {
      setStatusByPrinter((current) => ({ ...current, [status.printerId]: status }));
    }
    socket.on("printer:status", handleStatus);
    return () => {
      socket.off("printer:status", handleStatus);
    };
  }, []);

  function handleCreated(printer: PrinterPublic): void {
    setModalOpen(false);
    setPrinters((current) => [...current, printer]);
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
              <PrinterCard printer={printer} status={statusByPrinter[printer.id] ?? null} />
            </div>
          ))}
        </div>
      )}

      {modalOpen && selectedId && !isAll && (
        <NewPrinterModal inventoryId={selectedId} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
