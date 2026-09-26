import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Inventory } from "@filapilot/shared";
import { InventoryDeleteModal } from "./InventoryDeleteModal.js";
import { InventoryFormModal } from "./InventoryFormModal.js";
import { InventoryMembersModal } from "./InventoryMembersModal.js";
import { InventoryMoveModal } from "./InventoryMoveModal.js";
import { useInventoryStore } from "../stores/useInventoryStore.js";

type Dialog =
  | { kind: "create" }
  | { kind: "rename"; inventory: Inventory }
  | { kind: "members"; inventory: Inventory }
  | { kind: "move"; inventory: Inventory }
  | { kind: "delete"; inventory: Inventory };

const linkButton = "text-xs font-medium";

// Einstellungen -> Lager: eigene Lager ansehen, anlegen, umbenennen, Mitglieder verwalten, loeschen.
export function InventorySettings(): React.JSX.Element {
  const { t } = useTranslation();
  const inventories = useInventoryStore((state) => state.inventories);
  const load = useInventoryStore((state) => state.load);
  const select = useInventoryStore((state) => state.select);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  function close(): void {
    setDialog(null);
  }

  async function reloadAndOpen(id: string): Promise<void> {
    await reload();
    select(id);
  }

  // Bei verschluckten Ladefehlern bleibt die alte Liste stehen; der naechste Klick versucht es erneut.
  async function reload(): Promise<void> {
    try {
      await load();
    } catch {
      // Liste bleibt unveraendert
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{t("inventory.settingsTitle")}</h3>
        <button
          type="button"
          onClick={() => setDialog({ kind: "create" })}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {t("inventory.new")}
        </button>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{t("inventory.settingsHint")}</p>
      {inventories.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("inventory.noneText")}</p>
      ) : (
        <ul className="flex flex-col">
          {inventories.map((inventory) => (
            <li
              key={inventory.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--color-border)] py-3 first:border-t-0"
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: inventory.color }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{inventory.name}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {t(`inventory.role.${inventory.role}`)} · {t("inventory.counts", {
                    spools: inventory.spoolCount,
                    printers: inventory.printerCount,
                    members: inventory.memberCount
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" className={linkButton} style={{ color: "var(--accent)" }} onClick={() => select(inventory.id)}>
                  {t("inventory.open")}
                </button>
                <button
                  type="button"
                  className={linkButton}
                  style={{ color: "var(--accent)" }}
                  onClick={() => setDialog({ kind: "members", inventory })}
                >
                  {t("inventory.members")}
                </button>
                {inventory.role === "OWNER" && (
                  <>
                    <button
                      type="button"
                      className={linkButton}
                      style={{ color: "var(--accent)" }}
                      onClick={() => setDialog({ kind: "rename", inventory })}
                    >
                      {t("inventory.rename")}
                    </button>
                    {inventory.spoolCount > 0 && (
                      <button
                        type="button"
                        className={linkButton}
                        style={{ color: "var(--accent)" }}
                        onClick={() => setDialog({ kind: "move", inventory })}
                      >
                        {t("inventory.moveSpools")}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${linkButton} text-[var(--color-danger)]`}
                      onClick={() => setDialog({ kind: "delete", inventory })}
                    >
                      {t("common.delete")}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "create" && (
        <InventoryFormModal
          inventory={null}
          onClose={close}
          onSaved={(created) => {
            close();
            void reloadAndOpen(created.id);
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <InventoryFormModal
          inventory={dialog.inventory}
          onClose={close}
          onSaved={() => {
            close();
            void reload();
          }}
        />
      )}
      {dialog?.kind === "members" && (
        <InventoryMembersModal
          inventory={dialog.inventory}
          onClose={close}
          onChanged={() => void reload()}
        />
      )}
      {dialog?.kind === "move" && (
        <InventoryMoveModal
          inventory={dialog.inventory}
          onClose={close}
          onMoved={() => {
            close();
            void reload();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <InventoryDeleteModal
          inventory={dialog.inventory}
          onClose={close}
          onDeleted={() => {
            close();
            void reload();
          }}
        />
      )}
    </div>
  );
}
