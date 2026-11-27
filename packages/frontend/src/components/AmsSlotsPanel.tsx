import type { TFunction } from "i18next";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AMS_SLOTS_PER_UNIT,
  EXTERNAL_AMS_SLOT_INDEX,
  type AmsSlotView,
  type PrinterLiveStatus,
  type SpoolWithRelations
} from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { visibleAmsUnits } from "../lib/amsUnits.js";
import { mergeLiveSlots } from "../lib/mergeLiveSlots.js";
import { getSocket } from "../lib/socket.js";
import { ReportedFilament } from "./ReportedFilament.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

interface AmsSlotsPanelProps {
  printerId: string;
  inventoryId: string;
  canEdit: boolean;
  // Aktueller Stand vom Drucker; ueberschreibt Material, Farbe und Fuellstand der geladenen Faecher
  liveStatus: PrinterLiveStatus | undefined;
}

function concernsInventory(change: unknown, inventoryId: string): boolean {
  return typeof change === "object" && change !== null && "inventoryId" in change && change.inventoryId === inventoryId;
}

function slotTitle(t: TFunction, slotIndex: number, multipleUnits: boolean): string {
  if (slotIndex === EXTERNAL_AMS_SLOT_INDEX) {
    return t("printers.ams.external");
  }
  const index = (slotIndex % AMS_SLOTS_PER_UNIT) + 1;
  return multipleUnits
    ? t("printers.ams.slotInUnit", { unit: Math.floor(slotIndex / AMS_SLOTS_PER_UNIT) + 1, index })
    : t("printers.ams.slot", { index });
}

// Zuordnung "welche Spule liegt in welchem AMS-Slot (bzw. extern)" - Grundlage der automatischen Verbrauchsbuchung.
export function AmsSlotsPanel({ printerId, inventoryId, canEdit, liveStatus }: AmsSlotsPanelProps): React.JSX.Element | null {
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
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("printers.ams.loadFailed"));
    }
  }, [printerId, inventoryId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Zuordnungen aendern sich auch ohne diese Seite (Bambu-Abgleich, andere Benutzer): dann neu laden - ebenso nach einer
  // Wiederverbindung, weil Meldungen waehrend der Unterbrechung verloren sind.
  useEffect(() => {
    const socket = getSocket();
    function reload(): void {
      void load();
    }
    function handleChanged(change: unknown): void {
      if (concernsInventory(change, inventoryId)) {
        reload();
      }
    }
    socket.on("ams:changed", handleChanged);
    socket.on("connect", reload);
    return () => {
      socket.off("ams:changed", handleChanged);
      socket.off("connect", reload);
    };
  }, [load, inventoryId]);

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

  if (!slots) {
    return error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null;
  }

  // Immer alle vier Faecher der ersten AMS plus die externe Spule anzeigen, auch ohne Live-Meldung vom Drucker; weitere
  // AMS-Einheiten erscheinen, sobald der Drucker sie meldet.
  const views = mergeLiveSlots(slots, liveStatus);
  const units = visibleAmsUnits(views.map((slot) => slot.slotIndex));
  const multipleUnits = units.length > 1;
  const slotIndexes = [
    ...units.flatMap((unit) =>
      Array.from({ length: AMS_SLOTS_PER_UNIT }, (_, tray) => unit * AMS_SLOTS_PER_UNIT + tray)
    ),
    EXTERNAL_AMS_SLOT_INDEX
  ];
  const shown = slotIndexes.map(
    (slotIndex) =>
      views.find((slot) => slot.slotIndex === slotIndex) ?? {
        slotIndex,
        reportedMaterial: null,
        reportedColorHex: null,
        remainingPercent: null,
        spoolId: null,
        spoolLabel: null
      }
  );
  const spoolOptions = sortAlphabetically(
    spools,
    (spool) => `${spool.materialName} ${spool.colorName}`,
    i18n.language
  );

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-2">
      <div className="text-xs font-semibold text-[var(--color-text-secondary)]">{t("printers.ams.title")}</div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      {shown.map((slot) => (
        <div key={slot.slotIndex} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-[var(--color-text-muted)]">
            <span className="block">{slotTitle(t, slot.slotIndex, multipleUnits)}</span>
            <ReportedFilament material={slot.reportedMaterial} colorHex={slot.reportedColorHex} />
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
          {slot.auto && (
            <span className="shrink-0 text-[var(--color-text-muted)]" title={t("printers.ams.autoHint")}>
              {t("printers.ams.auto")}
            </span>
          )}
          {slot.remainingPercent !== null && (
            <span className="shrink-0 text-[var(--color-text-muted)]">{Math.round(slot.remainingPercent)} %</span>
          )}
        </div>
      ))}
    </div>
  );
}
