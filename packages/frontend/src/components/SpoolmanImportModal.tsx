import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SpoolmanImportSummary } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";

interface SpoolmanImportModalProps {
  inventoryId: string;
  inventoryName: string;
  onClose: () => void;
  onImported: () => void;
}

// Liest eine Spoolman-Export-Datei: entweder direkt eine Liste von Spulen, oder eine Antwort der Spoolman-API
// verpackt in "items"/"data".
function spoolsFromJson(text: string): unknown[] | null {
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (typeof parsed === "object" && parsed !== null) {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return record.items;
    }
    if (Array.isArray(record.data)) {
      return record.data;
    }
  }
  return null;
}

// Import aus Spoolman: nur eine JSON-Datei (Export der eigenen Spoolman-Instanz), keine Anmeldung noetig - anders
// als beim Bambu-Import gibt es keine Auswahl, alle gueltigen Eintraege werden auf einmal uebernommen (Doppelimport
// wird ueber die Spoolman-ID je Lager verhindert).
export function SpoolmanImportModal({ inventoryId, inventoryName, onClose, onImported }: SpoolmanImportModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SpoolmanImportSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let spools: unknown[] | null;
      try {
        spools = spoolsFromJson(await file.text());
      } catch {
        spools = null;
      }
      if (!spools) {
        throw new ApiRequestError("VALIDATION_ERROR", t("spoolman.fileInvalid"));
      }
      const result = await apiRequest<SpoolmanImportSummary>(`/inventories/${inventoryId}/spoolman-import/file`, {
        method: "POST",
        body: JSON.stringify({ spools })
      });
      setSummary(result);
      onImported();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("spoolman.importFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-[480px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-bold">{t("spoolman.title", { name: inventoryName })}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">{t("spoolman.intro")}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{t("spoolman.hint")}</p>

        {!summary && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy ? t("common.loading") : t("spoolman.chooseFile")}
            </button>
          </>
        )}

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {summary && (
          <p className="text-sm">
            {t("spoolman.result", { created: summary.created, updated: summary.updated, skipped: summary.skipped })}
          </p>
        )}
        {summary && summary.linked > 0 && <p className="text-xs text-[var(--color-text-secondary)]">{t("spoolman.linked", { count: summary.linked })}</p>}
        {summary && (summary.manufacturersCreated > 0 || summary.materialsCreated > 0) && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {t("bambu.createdCatalog", { manufacturers: summary.manufacturersCreated, materials: summary.materialsCreated })}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={summary ? "rounded-lg px-4 py-2 text-sm font-semibold text-white" : "rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"}
            style={summary ? { backgroundColor: "var(--accent)" } : undefined}
          >
            {summary ? t("common.close") : t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
