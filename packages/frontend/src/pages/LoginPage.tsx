import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { UserPublic } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { useAuthStore } from "../stores/useAuthStore.js";
import { useThemeStore } from "../stores/useThemeStore.js";

export function LoginPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const setStatus = useAuthStore((state) => state.setStatus);
  const setAccentColor = useThemeStore((state) => state.setAccentColor);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError(t("auth.enterCredentials"));
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password })
      });
      const me = await apiRequest<UserPublic>("/users/me");
      setUser(me);
      setStatus("authenticated");
      setAccentColor(me.themeAccentColor);
      navigate(me.mustChangePassword ? "/passwort-aendern" : "/");
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : t("auth.loginFailed");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-[340px] flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-white p-7"
      >
        <div className="mb-1 flex items-center gap-2">
          <img src="/icons/icon.svg" alt="" className="h-7 w-7" aria-hidden="true" />
          <span className="text-lg font-bold">{t("app.name")}</span>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("auth.username")}
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
          {t("auth.password")}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
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
          {t("auth.login")}
        </button>
      </form>
    </div>
  );
}
