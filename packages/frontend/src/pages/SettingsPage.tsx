import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { CatalogSection } from "../components/CatalogSettings.js";
import type {
  CreateUserInput,
  CreateUserResult,
  Settings,
  UpdateSettingsInput,
  UserPublic
} from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { useAuthStore } from "../stores/useAuthStore.js";
import { useThemeStore, DEFAULT_ACCENT } from "../stores/useThemeStore.js";

const ACCENT_PRESETS = ["#2F6FED", "#D85A30", "#639922", "#7F56D9", "#0F6E56", "#B3261E"];

function SectionCard({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-5">
      <h3 className="text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";

function OwnAccountSection(): React.JSX.Element {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const accentColor = useThemeStore((state) => state.accentColor);
  const setAccentColor = useThemeStore((state) => state.setAccentColor);
  const resetAccent = useThemeStore((state) => state.resetToDefault);
  const [saving, setSaving] = useState(false);

  async function applyColor(hex: string | null): Promise<void> {
    setSaving(true);
    try {
      const updated = await apiRequest<UserPublic>("/users/me/theme", {
        method: "PATCH",
        body: JSON.stringify({ themeAccentColor: hex })
      });
      setUser(updated);
      if (hex) {
        setAccentColor(hex);
      } else {
        resetAccent();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <></>;
  }

  return (
    <SectionCard title={t("settings.myAccount")}>
      <div className="text-sm">
        <span className="font-semibold">{user.username}</span>{" "}
        <span className="text-[var(--color-text-muted)]">({user.email})</span>
      </div>
      <Field label={t("settings.accentColor")}>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((hex) => (
            <button
              key={hex}
              type="button"
              disabled={saving}
              onClick={() => void applyColor(hex)}
              className="h-7 w-7 rounded-full border"
              style={{
                backgroundColor: hex,
                borderColor: accentColor.toLowerCase() === hex.toLowerCase() ? "#000" : "transparent",
                borderWidth: 2
              }}
              aria-label={hex}
            />
          ))}
          <input
            type="color"
            aria-label={t("settings.accentColor")}
            value={accentColor}
            onChange={(event) => void applyColor(event.target.value)}
            disabled={saving}
            className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
          <button
            type="button"
            disabled={saving || accentColor.toLowerCase() === DEFAULT_ACCENT.toLowerCase()}
            onClick={() => void applyColor(null)}
            className="text-xs font-medium text-[var(--color-text-secondary)] underline disabled:opacity-50"
          >
            {t("settings.resetColor")}
          </button>
        </div>
      </Field>
      <a href="/passwort-aendern" className="w-fit text-xs font-medium" style={{ color: "var(--accent)" }}>
        {t("settings.changePassword")}
      </a>
    </SectionCard>
  );
}

function GeneralSettingsSection({
  settings,
  onSaved
}: {
  settings: Settings;
  onSaved: (settings: Settings) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [photoUploadEnabled, setPhotoUploadEnabled] = useState(settings.photoUploadEnabled);
  const [syncInterval, setSyncInterval] = useState(String(settings.defaultPrinterSyncIntervalSeconds));
  const [backupEnabled, setBackupEnabled] = useState(settings.backupEnabled);
  const [backupFolderPath, setBackupFolderPath] = useState(settings.backupFolderPath);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const input: UpdateSettingsInput = {
        photoUploadEnabled,
        defaultPrinterSyncIntervalSeconds: Number(syncInterval),
        backupEnabled,
        backupFolderPath
      };
      const updated = await apiRequest<Settings>("/settings", {
        method: "PATCH",
        body: JSON.stringify(input)
      });
      onSaved(updated);
      setMessage(t("common.saved"));
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title={t("settings.general")}>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={photoUploadEnabled}
            onChange={(event) => setPhotoUploadEnabled(event.target.checked)}
          />
          {t("settings.photoUploadEnabled")}
        </label>
        <Field label={t("settings.syncInterval")}>
          <input
            type="number"
            min={10}
            max={3600}
            value={syncInterval}
            onChange={(event) => setSyncInterval(event.target.value)}
            className={inputClass}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={backupEnabled}
            onChange={(event) => setBackupEnabled(event.target.checked)}
          />
          {t("settings.backupEnabled")}
        </label>
        <Field label={t("settings.backupFolderPath")}>
          <input
            type="text"
            value={backupFolderPath}
            onChange={(event) => setBackupFolderPath(event.target.value)}
            className={inputClass}
          />
        </Field>
        {message && <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-fit rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {t("common.save")}
        </button>
      </form>
    </SectionCard>
  );
}

function SmtpSettingsSection({ settings }: { settings: Settings }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [host, setHost] = useState(settings.smtp?.host ?? "");
  const [port, setPort] = useState(settings.smtp ? String(settings.smtp.port) : "587");
  const [secure, setSecure] = useState(settings.smtp?.secure ?? false);
  const [username, setUsername] = useState(settings.smtp?.username ?? "");
  const [fromAddress, setFromAddress] = useState(settings.smtp?.fromAddress ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (!host.trim() || !username.trim() || !fromAddress.trim() || !password.trim()) {
        setMessage(t("settings.smtpIncomplete"));
        setSaving(false);
        return;
      }
      await apiRequest<Settings>("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          smtp: {
            host: host.trim(),
            port: Number(port),
            secure,
            username: username.trim(),
            fromAddress: fromAddress.trim(),
            password
          }
        })
      });
      setPassword("");
      setMessage(t("common.saved"));
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title={t("settings.smtp")}>
      <p className="text-xs text-[var(--color-text-muted)]">{t("settings.smtpHint")}</p>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <Field label={t("settings.smtpHost")}>
          <input type="text" value={host} onChange={(e) => setHost(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex gap-2">
          <Field label={t("settings.smtpPort")}>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("settings.smtpEncryption")}>
            <select
              value={secure ? "SSL" : "STARTTLS"}
              onChange={(e) => {
                const useSsl = e.target.value === "SSL";
                setSecure(useSsl);
                setPort(useSsl ? "465" : "587");
              }}
              className={inputClass}
            >
              {sortAlphabetically(
                [
                  { value: "STARTTLS", label: t("settings.smtpEncryptionStarttls") },
                  { value: "SSL", label: t("settings.smtpEncryptionSsl") }
                ],
                (option) => option.label,
                i18n.language
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("settings.smtpUsername")}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("settings.smtpFromAddress")}>
          <input
            type="email"
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("settings.smtpPassword")}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={settings.smtp ? t("settings.smtpPasswordPlaceholder") : ""}
            className={inputClass}
          />
        </Field>
        {message && <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-fit rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {t("common.save")}
        </button>
      </form>
    </SectionCard>
  );
}

function BackupSection(): React.JSX.Element {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleBackup(): Promise<void> {
    setRunning(true);
    setMessage(null);
    try {
      const result = await apiRequest<{ timestamp: string }>("/settings/backup", { method: "POST" });
      setMessage(t("settings.backupDone", { timestamp: result.timestamp }));
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : t("settings.backupFailed"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <SectionCard title={t("settings.backup")}>
      <p className="text-xs text-[var(--color-text-muted)]">{t("settings.backupExplanation")}</p>
      <button
        type="button"
        disabled={running}
        onClick={() => void handleBackup()}
        className="w-fit rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {t("settings.backupNow")}
      </button>
      {message && <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>}
    </SectionCard>
  );
}

function NewUserModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (user: CreateUserResult) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [forcePasswordChange, setForcePasswordChange] = useState(true);
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
    setError(null);
    if (!username.trim() || !email.trim()) {
      setError(t("settings.userFieldsRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const input: CreateUserInput = {
        username: username.trim(),
        email: email.trim(),
        role,
        forcePasswordChange
      };
      const created = await apiRequest<CreateUserResult>("/users", {
        method: "POST",
        body: JSON.stringify(input)
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("settings.userCreateFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-[380px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{t("settings.newUser")}</h2>
        <Field label={t("auth.username")}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("settings.email")}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t("settings.role")}>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}
            className={inputClass}
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
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={forcePasswordChange}
            onChange={(e) => setForcePasswordChange(e.target.checked)}
          />
          {t("settings.forcePasswordChange")}
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

function UserManagementSection(): React.JSX.Element {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserPublic[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newUserNotice, setNewUserNotice] = useState<CreateUserResult | null>(null);

  const load = useCallback(async () => {
    const data = await apiRequest<UserPublic[]>("/users");
    setUsers(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleCreated(created: CreateUserResult): void {
    setModalOpen(false);
    setNewUserNotice(created);
    void load();
  }

  return (
    <SectionCard title={t("settings.userManagement")}>
      {newUserNotice?.temporaryPassword && (
        <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-3 text-sm">
          {t("settings.temporaryPasswordNotice", {
            username: newUserNotice.username,
            password: newUserNotice.temporaryPassword
          })}
        </div>
      )}
      {users === null ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-[var(--color-text-muted)]">
              <th className="pb-2 font-medium">{t("auth.username")}</th>
              <th className="pb-2 font-medium">{t("settings.email")}</th>
              <th className="pb-2 font-medium">{t("settings.role")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--color-border)]">
                <td className="py-2">{u.username}</td>
                <td className="py-2 text-[var(--color-text-secondary)]">{u.email}</td>
                <td className="py-2 text-[var(--color-text-secondary)]">
                  {u.role === "ADMIN" ? t("settings.roleAdmin") : t("settings.roleUser")}
                  {u.mustChangePassword && (
                    <span className="ml-2 text-xs text-[var(--color-warning)]">
                      {t("settings.pendingPasswordChange")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="w-fit rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
      >
        {t("settings.newUser")}
      </button>
      {modalOpen && <NewUserModal onClose={() => setModalOpen(false)} onCreated={handleCreated} />}
    </SectionCard>
  );
}

export function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "ADMIN") {
      return;
    }
    apiRequest<Settings>("/settings")
      .then(setSettings)
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : t("settings.saveFailed"));
      });
  }, [user, t]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold">{t("nav.settings")}</h2>
      <OwnAccountSection />
      {user?.role === "ADMIN" && (
        <>
          <UserManagementSection />
          <CatalogSection />
          {loadError && <p className="text-sm text-[var(--color-danger)]">{loadError}</p>}
          {settings && <GeneralSettingsSection settings={settings} onSaved={setSettings} />}
          {settings && <SmtpSettingsSection settings={settings} />}
          <BackupSection />
        </>
      )}
    </div>
  );
}
