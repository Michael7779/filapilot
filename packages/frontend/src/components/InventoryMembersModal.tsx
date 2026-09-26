import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Inventory, InventoryMember, InventoryRole, MemberCandidate } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { useAuthStore } from "../stores/useAuthStore.js";

const ROLES: InventoryRole[] = ["OWNER", "EDITOR", "VIEWER"];
const selectClass = "rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm";

interface InventoryMembersModalProps {
  inventory: Inventory;
  onClose: () => void;
  // Nach Aenderungen, die die Lager-Liste betreffen (z.B. selbst verlassen)
  onChanged: () => void;
}

// Mitglieder eines Lagers. Besitzer (und Admins) verwalten, alle anderen sehen die Liste nur.
export function InventoryMembersModal({ inventory, onClose, onChanged }: InventoryMembersModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const isOwner = inventory.role === "OWNER";
  const [members, setMembers] = useState<InventoryMember[]>([]);
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<InventoryRole>("EDITOR");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await apiRequest<InventoryMember[]>(`/inventories/${inventory.id}/members`));
      if (isOwner) {
        setCandidates(await apiRequest<MemberCandidate[]>(`/inventories/${inventory.id}/member-candidates`));
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("inventory.loadFailed"));
    }
  }, [inventory.id, isOwner, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function run(action: () => Promise<unknown>, closeAfter = false): Promise<void> {
    setError(null);
    try {
      await action();
      if (closeAfter) {
        onChanged();
        onClose();
        return;
      }
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("inventory.saveFailed"));
    }
  }

  const base = `/inventories/${inventory.id}/members`;
  const roleLabel = (role: InventoryRole): string => t(`inventory.role.${role}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-[460px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-bold">{t("inventory.membersTitle", { name: inventory.name })}</h2>
        <ul className="flex flex-col">
          {members.map((member) => {
            const isSelf = member.userId === currentUser?.id;
            return (
              <li key={member.userId} className="flex items-center gap-2 border-t border-[var(--color-border)] py-2 first:border-t-0">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {member.username}
                  {isSelf && <span className="ml-1 text-xs text-[var(--color-text-muted)]">({t("inventory.you")})</span>}
                </span>
                {isOwner ? (
                  <select
                    value={member.role}
                    aria-label={t("inventory.roleLabel")}
                    onChange={(event) =>
                      void run(() =>
                        apiRequest(`${base}/${member.userId}`, { method: "PATCH", body: JSON.stringify({ role: event.target.value }) })
                      )
                    }
                    className={selectClass}
                  >
                    {sortAlphabetically(ROLES, roleLabel, i18n.language).map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-[var(--color-text-secondary)]">{roleLabel(member.role)}</span>
                )}
                {(isOwner || isSelf) && (
                  <button
                    type="button"
                    onClick={() => void run(() => apiRequest(`${base}/${member.userId}`, { method: "DELETE" }), isSelf)}
                    className="text-xs font-medium text-[var(--color-danger)]"
                  >
                    {isSelf ? t("inventory.leave") : t("inventory.removeMember")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {isOwner && (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">{t("inventory.addMember")}</span>
            <div className="flex flex-wrap gap-2">
              <select
                value={newUserId}
                onChange={(event) => setNewUserId(event.target.value)}
                aria-label={t("inventory.addMember")}
                className={`min-w-0 flex-1 ${selectClass}`}
              >
                <option value="">{t("inventory.chooseUser")}</option>
                {sortAlphabetically(candidates, (candidate) => candidate.username, i18n.language).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.username}
                  </option>
                ))}
              </select>
              <select value={newRole} onChange={(event) => setNewRole(event.target.value as InventoryRole)} className={selectClass}>
                {sortAlphabetically(ROLES, roleLabel, i18n.language).map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!newUserId}
                onClick={() =>
                  void run(async () => {
                    await apiRequest(base, { method: "POST", body: JSON.stringify({ userId: newUserId, role: newRole }) });
                    setNewUserId("");
                  })
                }
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {t("inventory.add")}
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">{t("inventory.rolesHint")}</p>
          </div>
        )}

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
