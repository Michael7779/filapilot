import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PrinterConnectionMode, PrinterPublic, UpdatePrinterInput } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

interface PrinterConnectionModalProps {
  printer: PrinterPublic;
  onClose: () => void;
  onChanged: () => void;
}

const inputClass = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";

// Verbindungsart eines Druckers aendern (lokal oder Bambu Cloud). Der gespeicherte Access Code wird nie angezeigt: bleibt das Feld
// bei einem schon lokalen Drucker leer, behaelt der Server ihn.
export function PrinterConnectionModal({ printer, onClose, onChanged }: PrinterConnectionModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<PrinterConnectionMode>(printer.connectionMode);
  const [ipAddress, setIpAddress] = useState(printer.ipAddress ?? "");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keepsAccessCode = printer.connectionMode === "LOCAL";

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
    const local = mode === "LOCAL";
    if (local && (!ipAddress.trim() || (!keepsAccessCode && !accessCode.trim()))) {
      setError(t("printers.fieldsRequired"));
      return;
    }
    const input: UpdatePrinterInput = {
      connectionMode: mode,
      ...(local ? { ipAddress: ipAddress.trim() } : {}),
      ...(local && accessCode.trim() ? { accessCode: accessCode.trim() } : {})
    };
    setBusy(true);
    try {
      await apiRequest<PrinterPublic>(`/printers/${printer.id}`, { method: "PATCH", body: JSON.stringify(input) });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("printers.connectionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const options = sortAlphabetically(
    [
      { value: "LOCAL", label: t("printers.connectionLocal") },
      { value: "CLOUD", label: t("printers.connectionCloud") }
    ],
    (option) => option.label,
    i18n.language
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex max-h-[90dvh] w-full max-w-[420px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{t("printers.connectionTitle", { name: printer.name })}</h2>
        <label className={labelClass}>
          {t("printers.connectionMode")}
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value === "LOCAL" ? "LOCAL" : "CLOUD")}
            className={inputClass}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {mode === "CLOUD" ? (
          <p className="text-xs text-[var(--color-text-muted)]">{t("printers.cloudHint")}</p>
        ) : (
          <>
            <label className={labelClass}>
              {t("printers.ipAddress")}
              <input type="text" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              {t("printers.accessCode")}
              <input
                type="text"
                value={accessCode}
                placeholder={keepsAccessCode ? t("printers.accessCodeUnchanged") : ""}
                onChange={(e) => setAccessCode(e.target.value)}
                className={inputClass}
              />
            </label>
          </>
        )}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
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
