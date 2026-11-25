import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CreatePrinterInput, PrinterConnectionMode, PrinterPublic } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

export function NewPrinterModal({
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
  const [connectionMode, setConnectionMode] = useState<PrinterConnectionMode>("CLOUD");
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
    const local = connectionMode === "LOCAL";
    if (!name.trim() || !serialNumber.trim() || (local && (!ipAddress.trim() || !accessCode.trim()))) {
      setError(t("printers.fieldsRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const input: CreatePrinterInput = {
        name: name.trim(),
        connectionMode,
        ipAddress: local ? ipAddress.trim() : null,
        serialNumber: serialNumber.trim(),
        accessCode: local ? accessCode.trim() : null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
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
          {t("printers.connectionMode")}
          <select
            value={connectionMode}
            onChange={(e) => setConnectionMode(e.target.value === "LOCAL" ? "LOCAL" : "CLOUD")}
            className={inputClass}
          >
            {sortAlphabetically(
              [
                { value: "LOCAL", label: t("printers.connectionLocal") },
                { value: "CLOUD", label: t("printers.connectionCloud") }
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
        {connectionMode === "CLOUD" && (
          <p className="text-xs text-[var(--color-text-muted)]">{t("printers.cloudHint")}</p>
        )}
        {connectionMode === "LOCAL" && (
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
        )}
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("printers.serialNumber")}
          <input
            type="text"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            className={inputClass}
          />
        </label>
        {connectionMode === "LOCAL" && (
          <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
            {t("printers.accessCode")}
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
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
