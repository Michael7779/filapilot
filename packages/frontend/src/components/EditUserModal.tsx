import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { UpdateUserInput, UserPublic } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

const INPUT_CLASS =
  "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";
const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";

export function EditUserModal({
  user,
  onClose,
  onSaved
}: {
  user: UserPublic;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserPublic["role"]>(user.role);
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
    if (!username.trim() || !email.trim()) {
      setError(t("settings.userFieldsRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input: UpdateUserInput = { username: username.trim(), email: email.trim(), role };
      await apiRequest(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify(input) });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("settings.saveFailed"));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-[380px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{t("settings.editUser")}</h2>
        <label className={LABEL_CLASS}>
          {t("auth.username")}
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={INPUT_CLASS} />
        </label>
        <label className={LABEL_CLASS}>
          {t("settings.email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS} />
        </label>
        <label className={LABEL_CLASS}>
          {t("settings.role")}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserPublic["role"])}
            className={INPUT_CLASS}
          >
            {sortAlphabetically(
              [
                { value: "USER", label: t("settings.roleUser") },
                { value: "ADMIN", label: t("settings.roleAdmin") }
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
