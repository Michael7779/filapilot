import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PrinterPublic } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { useInventoryStore } from "../stores/useInventoryStore.js";

interface PrinterMoveModalProps {
  printer: PrinterPublic;
  onClose: () => void;
  onMoved: () => void;
}

// Einen Drucker in ein anderes Lager verschieben - der Server verlangt Besitzer-Rechte im alten UND im neuen Lager.
export function PrinterMoveModal({
  printer,
  onClose,
  onMoved
}: PrinterMoveModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const inventories = useInventoryStore((state) => state.inventories);
  const targets = sortAlphabetically(
    inventories.filter((other) => other.id !== printer.inventoryId && other.role === "OWNER"),
    (other) => other.name,
    i18n.language
  );
  const [targetId, setTargetId] = useState("");
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
      await apiRequest<PrinterPublic>(`/printers/${printer.id}`, {
        method: "PATCH",
        body: JSON.stringify({ inventoryId: targetId })
      });
      onMoved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("printers.moveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-full max-w-[420px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{t("printers.moveTitle", { name: printer.name })}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">{t("printers.moveHint")}</p>
        {targets.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">{t("printers.moveNoTarget")}</p>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
            {t("printers.moveTarget")}
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
            >
              <option value="">{t("printers.movePick")}</option>
              {targets.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
            </select>
          </label>
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
            disabled={busy || !targetId}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {t("printers.moveConfirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
