import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SpoolWithRelations } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";

const INPUT_CLASS = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)]";
const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";

interface SpoolWeighModalProps {
  spool: SpoolWithRelations;
  onClose: () => void;
  onWeighed: () => void;
}

// "Wiegen": man traegt nur das auf der Waage abgelesene Gesamtgewicht ein, der Server zieht die hinterlegte Tara
// (Spool.tareWeightG) ab und setzt das Restgewicht - ohne selbst subtrahieren zu muessen.
export function SpoolWeighModal({ spool, onClose, onWeighed }: SpoolWeighModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const [measuredWeightG, setMeasuredWeightG] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  const missingTare = spool.tareWeightG === null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/spools/${spool.id}/weigh`, {
        method: "POST",
        body: JSON.stringify({ measuredWeightG: Number(measuredWeightG) })
      });
      onWeighed();
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("spools.weigh.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-full max-w-[380px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{t("spools.weigh.title", { name: `${spool.materialName} ${spool.colorName}` })}</h2>
        {missingTare ? (
          <p className="text-sm text-[var(--color-text-secondary)]">{t("spools.weigh.missingTare")}</p>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-secondary)]">{t("spools.weigh.hint", { tare: spool.tareWeightG })}</p>
            <label className={LABEL_CLASS}>
              {t("spools.weigh.measured")}
              <input
                type="number"
                min={0}
                required
                value={measuredWeightG}
                onChange={(event) => setMeasuredWeightG(event.target.value)}
                className={INPUT_CLASS}
                autoFocus
              />
            </label>
          </>
        )}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
            {t("common.cancel")}
          </button>
          {!missingTare && (
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {submitting ? t("common.loading") : t("spools.weigh.save")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
