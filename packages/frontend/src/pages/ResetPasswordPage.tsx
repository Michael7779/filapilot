import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, ApiRequestError } from "../lib/api.js";

export function ResetPasswordPage(): React.JSX.Element {
  const { t } = useTranslation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError(t("auth.resetLinkInvalid"));
      return;
    }
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
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword })
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("auth.resetLinkInvalid"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="flex w-full max-w-[340px] flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-white p-7">
        <div className="mb-1 flex items-center gap-2">
          <img src="/icons/icon.svg" alt="" className="h-7 w-7" aria-hidden="true" />
          <span className="text-lg font-bold">{t("app.name")}</span>
        </div>

        {done ? (
          <>
            <p className="text-sm text-[var(--color-text-secondary)]">{t("auth.resetDoneHint")}</p>
            <a href="/login" className="self-center text-xs font-medium" style={{ color: "var(--accent)" }}>
              {t("auth.backToLogin")}
            </a>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
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
        )}
      </div>
    </div>
  );
}
