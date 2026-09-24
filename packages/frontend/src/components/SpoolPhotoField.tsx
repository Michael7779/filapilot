import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { prepareSpoolPhoto, type PhotoChange } from "../lib/spoolPhoto.js";

interface SpoolPhotoFieldProps {
  currentUrl: string | null;
  value: PhotoChange;
  onChange: (change: PhotoChange) => void;
}

function shownPhotoUrl(value: PhotoChange, currentUrl: string | null): string | null {
  if (value.kind === "set") {
    return value.previewUrl;
  }
  return value.kind === "remove" ? null : currentUrl;
}

export function SpoolPhotoField({ currentUrl, value, onChange }: SpoolPhotoFieldProps): React.JSX.Element {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = value.kind === "set" ? value.previewUrl : null;

  // Vorschau-URLs wieder freigeben, wenn sie nicht mehr gebraucht werden.
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    setError(null);
    try {
      const blob = await prepareSpoolPhoto(file);
      onChange({ kind: "set", blob, previewUrl: URL.createObjectURL(blob) });
    } catch {
      setError(t("spools.photoUnsupported"));
    }
  }

  const shownUrl = shownPhotoUrl(value, currentUrl);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-[var(--color-text-secondary)]">{t("spools.photo")}</span>
      <div className="flex items-center gap-3">
        {shownUrl ? (
          <img src={shownUrl} alt="" className="h-16 w-16 rounded-lg border border-[var(--color-border)] object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
            {t("spools.noPhoto")}
          </div>
        )}
        <div className="flex flex-col items-start gap-1 text-xs font-medium">
          <button type="button" onClick={() => inputRef.current?.click()} style={{ color: "var(--accent)" }}>
            {shownUrl ? t("spools.photoReplace") : t("spools.photoAdd")}
          </button>
          {shownUrl && (
            <button type="button" onClick={() => onChange({ kind: "remove" })} className="text-[var(--color-danger)]">
              {t("spools.photoRemove")}
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
