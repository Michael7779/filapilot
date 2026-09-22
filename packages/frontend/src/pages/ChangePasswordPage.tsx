import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { useAuthStore } from "../stores/useAuthStore.js";

export function ChangePasswordPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 10) {
      setError(t("auth.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordsMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (user) {
        setUser({ ...user, mustChangePassword: false });
      }
      navigate("/");
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : t("auth.changePasswordFailed");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-[360px] flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-white p-7"
      >
        <div>
          <h1 className="text-lg font-bold">{t("auth.changePasswordTitle")}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {t("auth.changePasswordHint")}
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("auth.currentPassword")}
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("auth.newPassword")}
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("auth.confirmPassword")}
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          />
        </label>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {t("auth.save")}
        </button>
      </form>
    </div>
  );
}
