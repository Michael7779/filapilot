import { useTranslation } from "react-i18next";
import type { PrinterLiveStatus, PrinterPublic } from "@filapilot/shared";
import { AmsSlotsPanel } from "./AmsSlotsPanel.js";

interface PrinterCardProps {
  printer: PrinterPublic;
  status: PrinterLiveStatus | undefined;
  canEdit: boolean;
  // Nur gesetzt, wenn der Nutzer im Lager des Druckers Besitzer ist
  onMove?: () => void;
  onChangeConnection?: () => void;
}

export function PrinterCard({ printer, status, canEdit, onMove, onChangeConnection }: PrinterCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const connected = status?.connected ?? false;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{printer.name}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {printer.ipAddress ?? t("printers.viaCloud")}
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={
            connected
              ? { backgroundColor: "var(--color-success)", color: "#fff" }
              : { backgroundColor: "var(--color-bg)", color: "var(--color-text-muted)" }
          }
        >
          {connected ? t("printers.connected") : t("printers.disconnected")}
        </span>
      </div>
      {!connected && status?.issue && (
        <p className="mb-2 text-xs text-[var(--color-danger)]">
          {status.issue === "cloud_no_account"
            ? t("printers.issueCloudNoAccount")
            : t("printers.issueCloudRejected")}
        </p>
      )}
      {status?.printing && (
        <div className="mb-2">
          <div className="mb-1 flex justify-between gap-2 text-xs text-[var(--color-text-secondary)]">
            <span className="min-w-0 truncate">{status.currentJobName ?? t("printers.printing")}</span>
            {status.progressPercent !== null && <span className="shrink-0">{Math.round(status.progressPercent)} %</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${status.progressPercent ?? 0}%`,
                backgroundColor: "var(--accent)"
              }}
            />
          </div>
        </div>
      )}
      <div className="text-xs text-[var(--color-text-muted)]">
        {t("printers.syncMode")}:{" "}
        {printer.syncMode === "LIVE" ? t("printers.syncModeLive") : t("printers.syncModePeriodic")}
      </div>
      {printer.inventoryId && (
        <AmsSlotsPanel printerId={printer.id} inventoryId={printer.inventoryId} canEdit={canEdit} liveStatus={status} />
      )}
      {onChangeConnection && (
        <button
          type="button"
          onClick={onChangeConnection}
          className="mt-3 mr-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]"
        >
          {t("printers.changeConnection")}
        </button>
      )}
      {onMove && (
        <button
          type="button"
          onClick={onMove}
          className="mt-3 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]"
        >
          {t("printers.move")}
        </button>
      )}
    </div>
  );
}
