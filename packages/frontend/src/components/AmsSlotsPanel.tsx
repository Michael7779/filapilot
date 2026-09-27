import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EXTERNAL_AMS_SLOT_INDEX, type AmsSlotView, type SpoolWithRelations } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

interface AmsSlotsPanelProps {
  printerId: string;
  inventoryId: string;
  canEdit: boolean;
}

function slotTitleKey(slotIndex: number): string {
  return slotIndex === EXTERNAL_AMS_SLOT_INDEX ? "printers.ams.external" : "printers.ams.slot";
}

// Zuordnung "welche Spule liegt in welchem AMS-Slot (bzw. extern)" - Grundlage der automatischen Verbrauchsbuchung.
export function AmsSlotsPanel({ printerId, inventoryId, canEdit }: AmsSlotsPanelProps): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  const [slots, setSlots] = useState<AmsSlotView[] | null>(null);
  const [spools, setSpools] = useState<SpoolWithRelations[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [slotData, spoolData] = await Promise.all([
        apiRequest<AmsSlotView[]>(`/printers/${printerId}/ams-slots`),
        apiRequest<SpoolWithRelations[]>(`/spools?inventoryId=${inventoryId}&archived=exclude`)
      ]);
      setSlots(slotData);
      setSpools(spoolData);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("printers.ams.loadFailed"));
    }
  }, [printerId, inventoryId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(slotIndex: number, spoolId: string): Promise<void> {
    setBusySlot(slotIndex);
    setError(null);
    try {
      setSlots(await apiRequest<AmsSlotView[]>(`/printers/${printerId}/ams-slots/${slotIndex}`, {
        method: "PUT",
        body: JSON.stringify({ spoolId: spoolId || null })
      }));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("printers.ams.assignFailed"));
    } finally {
      setBusySlot(null);
    }
  }

  if (error) {
    return <p className="text-xs text-[var(--color-danger)]">{error}</p>;
  }
  if (!slots) {
    return null;
  }

  // Immer alle vier AMS-Slots plus die externe Spule anzeigen, auch ohne Live-Meldung vom Drucker.
  const shown = [0, 1, 2, 3, EXTERNAL_AMS_SLOT_INDEX].map(
    (slotIndex) => slots.find((slot) => slot.slotIndex === slotIndex) ?? { slotIndex, reportedMaterial: null, reportedColorHex: null, remainingPercent: null, spoolId: null, spoolLabel: null }
  );
  const spoolOptions = sortAlphabetically(spools, (spool) => `${spool.materialName} ${spool.colorName}`, i18n.language);

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-2">
      <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{t("printers.ams.title")}</div>
      {shown.map((slot) => (
        <div key={slot.slotIndex} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-[var(--color-text-muted)]">
            {t(slotTitleKey(slot.slotIndex), { index: slot.slotIndex + 1 })}
          </span>
          {canEdit ? (
            <select
              value={slot.spoolId ?? ""}
              disabled={busySlot === slot.slotIndex}
              onChange={(event) => void assign(slot.slotIndex, event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-white px-1.5 py-1 text-[var(--color-text-primary)]"
            >
              <option value="">{t("printers.ams.none")}</option>
              {spoolOptions.map((spool) => (
                <option key={spool.id} value={spool.id}>
                  {spool.materialName} {spool.colorName}
                </option>
              ))}
            </select>
          ) : (
            <span className="min-w-0 flex-1 truncate">{slot.spoolLabel ?? t("printers.ams.none")}</span>
          )}
          {slot.remainingPercent !== null && (
            <span className="shrink-0 text-[var(--color-text-muted)]">{Math.round(slot.remainingPercent)} %</span>
          )}
        </div>
      ))}
    </div>
  );
}
