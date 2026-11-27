import { useCallback, useEffect, useState } from "react";
import type { PrinterLiveStatus, PrinterPublic } from "@filapilot/shared";
import { apiRequest } from "../lib/api.js";
import { getSocket } from "../lib/socket.js";

export interface PrinterStatuses {
  statusByPrinter: Record<string, PrinterLiveStatus>;
  refreshStatuses: (printers: PrinterPublic[]) => Promise<void>;
}

// Live-Status der angezeigten Drucker: einmal abgefragt, danach ueber Socket.IO aktuell gehalten. Nach jeder
// (Wieder-)Verbindung wird neu abgefragt - was waehrend einer Unterbrechung gesendet wurde, ist sonst verloren
// (z.B. Handy im Standby oder Neustart des Servers).
export function usePrinterStatuses(printers: PrinterPublic[]): PrinterStatuses {
  const [statusByPrinter, setStatusByPrinter] = useState<Record<string, PrinterLiveStatus>>({});

  const refreshStatuses = useCallback(async (list: PrinterPublic[]) => {
    const statuses = await Promise.all(
      list.map((printer) => apiRequest<PrinterLiveStatus>(`/printers/${printer.id}/status`))
    );
    setStatusByPrinter((current) => ({ ...current, ...Object.fromEntries(statuses.map((s) => [s.printerId, s])) }));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    function handleStatus(status: PrinterLiveStatus): void {
      setStatusByPrinter((current) => ({ ...current, [status.printerId]: status }));
    }
    function handleConnect(): void {
      refreshStatuses(printers).catch((error: unknown) => {
        console.error("Druckerstatus konnte nicht neu geladen werden", error);
      });
    }
    socket.on("printer:status", handleStatus);
    socket.on("connect", handleConnect);
    return () => {
      socket.off("printer:status", handleStatus);
      socket.off("connect", handleConnect);
    };
  }, [printers, refreshStatuses]);

  return { statusByPrinter, refreshStatuses };
}
