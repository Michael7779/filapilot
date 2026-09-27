import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SpoolWithRelations } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";

const INPUT_CLASS = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)]";
const LABEL_CLASS = "flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]";

interface SpoolDryingModalProps {
  spool: SpoolWithRelations;
  onClose: () => void;
  onLogged: () => void;
}

// Trocknung protokollieren (Temperatur, Dauer, optionale Notiz) - erscheint danach im Verlauf der Spule
// (siehe SpoolHistoryModal), da der Server dafuer nur einen Eintrag im bestehenden Aenderungsprotokoll anlegt.
export function SpoolDryingModal({ spool, onClose, onLogged }: SpoolDryingModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const [temperatureC, setTemperatureC] = useState("60");
  const [durationMinutes, setDurationMinutes] = useState("240");
  const [note, setNote] = useState("");
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/spools/${spool.id}/drying`, {
        method: "POST",
        body: JSON.stringify({
          temperatureC: Number(temperatureC),
          durationMinutes: Number(durationMinutes),
          note: note.trim() ? note.trim() : null
        })
      });
      onLogged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("spools.drying.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-full max-w-[420px] flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-6"
      >
        <h2 className="text-lg font-bold">{t("spools.drying.title", { name: `${spool.materialName} ${spool.colorName}` })}</h2>
        <div className="flex gap-3">
          <label className={`flex-1 ${LABEL_CLASS}`}>
            {t("spools.drying.temperature")}
            <input
              type="number"
              min={1}
              max={150}
              required
              value={temperatureC}
              onChange={(event) => setTemperatureC(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <label className={`flex-1 ${LABEL_CLASS}`}>
            {t("spools.drying.duration")}
            <input
              type="number"
              min={1}
              max={2880}
              required
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>
        </div>
        <label className={LABEL_CLASS}>
          {t("spools.drying.note")}
          <input type="text" value={note} onChange={(event) => setNote(event.target.value)} className={INPUT_CLASS} />
        </label>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {submitting ? t("common.loading") : t("spools.drying.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
