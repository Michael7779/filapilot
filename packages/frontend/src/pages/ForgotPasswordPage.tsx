import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../lib/api.js";

export function ForgotPasswordPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!email.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() })
      });
    } finally {
      setSubmitting(false);
      // Immer die gleiche Meldung, egal ob die E-Mail existiert (kein User-Enumeration-Leak).
      setSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="flex w-full max-w-[340px] flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-white p-7">
        <div className="mb-1 flex items-center gap-2">
          <img src="/icons/icon.svg" alt="" className="h-7 w-7" aria-hidden="true" />
          <span className="text-lg font-bold">{t("app.name")}</span>
        </div>

        {submitted ? (
          <p className="text-sm text-[var(--color-text-secondary)]">{t("auth.resetRequestedHint")}</p>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
            <p className="text-sm text-[var(--color-text-secondary)]">{t("auth.forgotPasswordHint")}</p>
            <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
              {t("settings.email")}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {t("auth.sendResetLink")}
            </button>
          </form>
        )}

        <a href="/login" className="self-center text-xs font-medium" style={{ color: "var(--accent)" }}>
          {t("auth.backToLogin")}
        </a>
      </div>
    </div>
  );
}
