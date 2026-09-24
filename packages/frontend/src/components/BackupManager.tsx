import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RESTORE_CONFIRMATION_WORD, type BackupInfo, type RestoreStatus } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";

const POLL_INTERVAL_MS = 2000;

function formatSize(bytes: number, locale: string): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString(locale, { maximumFractionDigits: 0 })} KB`;
  }
  return `${(bytes / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}

function RestoreDialog({
  backup,
  onClose
}: {
  backup: BackupInfo;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [word, setWord] = useState("");
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<RestoreStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishedWhileLoggedOut, setFinishedWhileLoggedOut] = useState(false);
  const date = new Date(backup.createdAt).toLocaleString(i18n.language);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !started) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, started]);

  useEffect(() => {
    if (!started || finishedWhileLoggedOut || status?.state === "done" || status?.state === "failed") {
      return;
    }
    const timer = window.setInterval(() => {
      apiRequest<RestoreStatus>("/settings/backups/restore-status")
        .then(setStatus)
        .catch((err: unknown) => {
          // Nach dem Einspielen stammen die Sitzungen aus der Sicherung - die aktuelle ist dann ungueltig.
          if (err instanceof ApiRequestError && err.code === "UNAUTHORIZED") {
            setFinishedWhileLoggedOut(true);
          }
        });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [started, finishedWhileLoggedOut, status?.state]);

  async function handleStart(): Promise<void> {
    setError(null);
    try {
      await apiRequest(`/settings/backups/${backup.timestamp}/restore`, {
        method: "POST",
        body: JSON.stringify({ confirmation: RESTORE_CONFIRMATION_WORD })
      });
      setStarted(true);
      setStatus({ state: "running", step: "safety-backup", timestamp: backup.timestamp, message: null });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("backup.restoreFailed"));
    }
  }

  const done = finishedWhileLoggedOut || status?.state === "done";
  const failed = status?.state === "failed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-[420px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-bold">{t("backup.restoreTitle")}</h2>

        {!started && (
          <>
            <p className="text-sm">{t("backup.restoreWarning", { date })}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-text-secondary)]">
              <li>{t("backup.restoreInfoSafety")}</li>
              <li>{t("backup.restoreInfoLogin")}</li>
              {backup.hasUploads && <li>{t("backup.restoreInfoUploads")}</li>}
            </ul>
            <label className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
              {t("backup.typeToConfirm", { word: RESTORE_CONFIRMATION_WORD })}
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                autoComplete="off"
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
              />
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
                type="button"
                disabled={word !== RESTORE_CONFIRMATION_WORD}
                onClick={() => void handleStart()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                style={{ backgroundColor: "var(--color-danger)" }}
              >
                {t("backup.restoreNow")}
              </button>
            </div>
          </>
        )}

        {started && !done && !failed && (
          <>
            <p className="text-sm">{t(`backup.step.${status?.step ?? "safety-backup"}`)}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{t("backup.pleaseWait")}</p>
          </>
        )}

        {done && (
          <>
            <p className="text-sm text-[var(--color-success)]">{t("backup.restoreDone")}</p>
            {status?.message && <p className="text-sm text-[var(--color-warning)]">{status.message}</p>}
            <button
              type="button"
              onClick={() => window.location.assign("/login")}
              className="self-end rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {t("backup.toLogin")}
            </button>
          </>
        )}

        {failed && (
          <>
            <p className="text-sm text-[var(--color-danger)]">{t("backup.restoreFailedUnchanged")}</p>
            {status?.message && (
              <p className="break-words text-xs text-[var(--color-text-secondary)]">{status.message}</p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="self-end rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
            >
              {t("common.close")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function BackupTable({
  backups,
  onRestore
}: {
  backups: BackupInfo[] | null;
  onRestore: (backup: BackupInfo) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  if (backups === null) {
    return <p className="text-sm text-[var(--color-text-secondary)]">{t("common.loading")}</p>;
  }
  if (backups.length === 0) {
    return <p className="text-sm text-[var(--color-text-secondary)]">{t("backup.none")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase text-[var(--color-text-muted)]">
            <th className="pb-2 font-medium">{t("backup.createdAt")}</th>
            <th className="pb-2 font-medium">{t("backup.contents")}</th>
            <th className="pb-2 text-right font-medium">{t("backup.size")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => (
            <tr key={backup.timestamp} className="border-t border-[var(--color-border)]">
              <td className="py-2.5">{new Date(backup.createdAt).toLocaleString(i18n.language)}</td>
              <td className="py-2.5 text-[var(--color-text-secondary)]">
                {backup.hasUploads ? t("backup.contentsWithUploads") : t("backup.contentsDatabase")}
              </td>
              <td className="py-2.5 text-right">{formatSize(backup.sizeBytes, i18n.language)}</td>
              <td className="py-2.5">
                <div className="flex justify-end gap-3 text-xs font-medium">
                  <a
                    href={`/api/settings/backups/${backup.timestamp}/download`}
                    download
                    style={{ color: "var(--accent)" }}
                  >
                    {t("backup.download")}
                  </a>
                  <button
                    type="button"
                    onClick={() => onRestore(backup)}
                    style={{ color: "var(--accent)" }}
                  >
                    {t("backup.restore")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BackupManager(): React.JSX.Element {
  const { t } = useTranslation();
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);

  const load = useCallback(async () => {
    try {
      setBackups(await apiRequest<BackupInfo[]>("/settings/backups"));
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : t("backup.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleBackup(): Promise<void> {
    setRunning(true);
    setMessage(null);
    try {
      const result = await apiRequest<{ timestamp: string }>("/settings/backup", { method: "POST" });
      setMessage(t("settings.backupDone", { timestamp: result.timestamp }));
      await load();
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : t("settings.backupFailed"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h3 className="text-sm font-bold">{t("settings.backup")}</h3>
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
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{t("backup.existing")}</h3>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium"
          >
            {t("backup.refresh")}
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">{t("backup.existingHint")}</p>
        <BackupTable backups={backups} onRestore={setRestoring} />
      </div>

      {restoring && <RestoreDialog backup={restoring} onClose={() => setRestoring(null)} />}
    </>
  );
}
