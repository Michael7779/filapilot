import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import type { SpoolWithRelations } from "@filapilot/shared";

export function SpoolLabelModal({
  spool,
  onClose
}: {
  spool: SpoolWithRelations;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    QRCode.toCanvas(canvas, `filapilot:spool:${spool.id}`, { width: 220, margin: 1 }).catch(() => {
      setError(t("spools.qrLabelFailed"));
    });
  }, [spool.id, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-[380px] flex-col gap-4 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-bold">{t("spools.qrLabel")}</h2>

        <div className="print-only flex flex-col items-center gap-2 rounded-lg border border-[var(--color-border)] p-4">
          <canvas ref={canvasRef} />
          <div className="text-center text-sm font-semibold">
            {spool.materialName} {spool.colorName}
          </div>
          <div className="text-center text-xs text-[var(--color-text-secondary)]">
            {spool.manufacturerName}
          </div>
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {t("spools.printLabel")}
          </button>
        </div>
      </div>
    </div>
  );
}
