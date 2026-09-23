import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SetupInput, UserPublic } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { useAuthStore } from "../stores/useAuthStore.js";

const INPUT_CLASS =
  "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";
const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";

export function SetupPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const setStatus = useAuthStore((state) => state.setStatus);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState("admin");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiRequest<{ needsSetup: boolean }>("/setup/status")
      .then((result) => setNeedsSetup(result.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (username.trim().length < 3 || !email.trim()) {
      setError(t("setup.fieldsRequired"));
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
      const input: SetupInput = { username: username.trim(), email: email.trim(), password: newPassword };
      const created = await apiRequest<UserPublic>("/setup", {
        method: "POST",
        body: JSON.stringify(input)
      });
      setUser(created);
      setStatus("authenticated");
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("setup.failed"));
      setSubmitting(false);
    }
  }

  if (needsSetup === null) {
    return <div className="flex h-screen items-center justify-center">{t("common.loading")}</div>;
  }
  if (!needsSetup) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg)] p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-[380px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-7"
      >
        <div className="flex items-center gap-2">
          <img src="/icons/icon.svg" alt="" className="h-7 w-7" aria-hidden="true" />
          <span className="text-lg font-bold">{t("app.name")}</span>
        </div>
        <h1 className="text-base font-bold">{t("setup.title")}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{t("setup.intro")}</p>

        <label className={LABEL_CLASS}>
          {t("auth.username")}
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          {t("settings.email")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          {t("auth.password")}
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          {t("auth.confirmPassword")}
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className={INPUT_CLASS}
          />
        </label>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {t("setup.create")}
        </button>
      </form>
    </div>
  );
}
