import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InventoryFormModal } from "./InventoryFormModal.js";
import { useInventoryStore } from "../stores/useInventoryStore.js";

// Leerer Zustand fuer Benutzer, die noch in keinem Lager sind.
export function NoInventory(): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const load = useInventoryStore((state) => state.load);
  const select = useInventoryStore((state) => state.select);

  async function openCreated(id: string): Promise<void> {
    await load();
    select(id);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 py-10">
      <h2 className="text-lg font-bold">{t("inventory.noneTitle")}</h2>
      <p className="text-sm text-[var(--color-text-secondary)]">{t("inventory.noneText")}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--accent)" }}
      >
        {t("inventory.new")}
      </button>
      {open && (
        <InventoryFormModal
          inventory={null}
          onClose={() => setOpen(false)}
          onSaved={(created) => {
            setOpen(false);
            void openCreated(created.id);
          }}
        />
      )}
    </div>
  );
}
