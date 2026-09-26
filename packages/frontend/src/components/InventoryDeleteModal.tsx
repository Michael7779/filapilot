import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Inventory } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";

interface InventoryDeleteModalProps {
  inventory: Inventory;
  onClose: () => void;
  onDeleted: () => void;
}

// Loeschen samt Inhalt: erst nach dem Eintippen des exakten Lager-Namens moeglich.
export function InventoryDeleteModal({ inventory, onClose, onDeleted }: InventoryDeleteModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/inventories/${inventory.id}`, { method: "DELETE", body: JSON.stringify({ confirmName }) });
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("inventory.deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-full max-w-[420px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{t("inventory.deleteTitle", { name: inventory.name })}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t("inventory.deleteWarning", { spools: inventory.spoolCount, printers: inventory.printerCount })}
        </p>
        <p className="text-sm text-[var(--color-text-secondary)]">{t("inventory.deleteBackupHint")}</p>
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("inventory.typeName", { name: inventory.name })}
          <input
            type="text"
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            autoComplete="off"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          />
        </label>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || confirmName !== inventory.name}
            className="rounded-lg bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("inventory.deleteNow")}
          </button>
        </div>
      </form>
    </div>
  );
}
