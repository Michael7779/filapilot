import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_INVENTORY_COLOR,
  INVENTORY_COLORS,
  type CreateInventoryInput,
  type Inventory
} from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";

interface InventoryFormModalProps {
  // vorhandenes Lager = umbenennen/Farbe aendern, sonst neu anlegen
  inventory: Inventory | null;
  onClose: () => void;
  onSaved: (inventory: Inventory) => void;
}

export function InventoryFormModal({ inventory, onClose, onSaved }: InventoryFormModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState(inventory?.name ?? "");
  const [color, setColor] = useState<string>(inventory?.color ?? DEFAULT_INVENTORY_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    if (!name.trim()) {
      setError(t("inventory.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), color } satisfies Record<keyof CreateInventoryInput, string>;
      const saved = inventory
        ? await apiRequest<Inventory>(`/inventories/${inventory.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiRequest<Inventory>("/inventories", { method: "POST", body: JSON.stringify(body) });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("inventory.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-full max-w-[380px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{inventory ? t("inventory.rename") : t("inventory.new")}</h2>
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("inventory.name")}
          <input
            type="text"
            value={name}
            maxLength={60}
            placeholder={t("inventory.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">{t("inventory.color")}</span>
          <div className="flex flex-wrap gap-2">
            {INVENTORY_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                onClick={() => setColor(hex)}
                className="h-7 w-7 rounded-full border"
                style={{
                  backgroundColor: hex,
                  borderColor: color === hex ? "var(--accent)" : "var(--color-border)",
                  borderWidth: color === hex ? 2 : 1,
                  boxShadow: color === hex ? "0 0 0 2px var(--color-accent-bg)" : "none"
                }}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
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
