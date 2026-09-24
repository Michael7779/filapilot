import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, ApiRequestError } from "../lib/api.js";

interface BackupUploadButtonProps {
  onUploaded: () => void;
}

// Nimmt eine per "Herunterladen" gespeicherte Sicherung (.tar) entgegen und legt sie im Backup-Ordner ab.
// Eingespielt wird sie erst ueber "Wiederherstellen" - hier passiert nur das Ablegen.
export function BackupUploadButton({ onUploaded }: BackupUploadButtonProps): React.JSX.Element {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      await apiRequest("/settings/backups/upload", {
        method: "POST",
        headers: { "Content-Type": "application/x-tar" },
        body: file
      });
      setMessage(t("backup.uploadDone"));
      onUploaded();
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : t("backup.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-60"
      >
        {uploading ? t("backup.uploading") : t("backup.upload")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".tar,application/x-tar"
        className="hidden"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {message && <p className="text-xs text-[var(--color-text-secondary)]">{message}</p>}
    </div>
  );
}
