import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { BackupInfo, BambuConnectionInfo, Settings } from "@filapilot/shared";
import { apiRequest } from "../lib/api.js";
import {
  backupSignal,
  bambuSignal,
  type AttentionItem,
  type BackupSignal,
  type BambuSignal
} from "../lib/dashboardSignals.js";
import { ALL_INVENTORIES, useInventoryStore } from "../stores/useInventoryStore.js";
import { useAuthStore } from "../stores/useAuthStore.js";

interface InventoryBambuSignal {
  inventoryId: string;
  inventoryName: string;
  signal: BambuSignal;
}

// Sicherungen sieht nur ein Admin (die Routen sind Admin-only) - fuer alle anderen wird gar nicht erst gefragt.
function useBackupSignal(isAdmin: boolean): BackupSignal | null {
  const [signal, setSignal] = useState<BackupSignal | null>(null);
  useEffect(() => {
    if (!isAdmin) {
      setSignal(null);
      return;
    }
    let cancelled = false;
    Promise.all([apiRequest<Settings>("/settings"), apiRequest<BackupInfo[]>("/settings/backups")])
      .then(([settings, backups]) => {
        if (!cancelled) {
          setSignal(backupSignal(settings.backupEnabled, backups, new Date()));
        }
      })
      // Das Signal ist ein Zusatzhinweis: kann es nicht ermittelt werden, bleibt es weg, statt eine falsche Warnung zu zeigen.
      .catch(() => !cancelled && setSignal(null));
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);
  return signal;
}

// Gemerkte Bambu-Cloud-Verbindungen des gewaehlten Lagers (bei "Alle Lager": aller eigenen Lager). Die Route verlangt mindestens
// die Betrachter-Rolle im Lager, ein Lager ohne Zugriff wird serverseitig abgewiesen und hier ausgelassen.
function useBambuSignals(selectedId: string | null): InventoryBambuSignal[] {
  const inventories = useInventoryStore((state) => state.inventories);
  const [signals, setSignals] = useState<InventoryBambuSignal[]>([]);
  useEffect(() => {
    const targets = inventories.filter((inventory) => selectedId === ALL_INVENTORIES || inventory.id === selectedId);
    let cancelled = false;
    Promise.all(
      targets.map(async (inventory): Promise<InventoryBambuSignal | null> => {
        const info = await apiRequest<BambuConnectionInfo>(`/inventories/${inventory.id}/bambu-import/connection`).catch(() => null);
        const signal = info ? bambuSignal(info, new Date()) : null;
        return signal ? { inventoryId: inventory.id, inventoryName: inventory.name, signal } : null;
      })
    ).then((results) => {
      if (!cancelled) {
        setSignals(results.filter((entry): entry is InventoryBambuSignal => entry !== null));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [inventories, selectedId]);
  return signals;
}

function bambuText(t: TFunction, name: string, signal: BambuSignal): string {
  if (signal.kind === "tokenExpired") {
    return t("dashboard.attention.bambuTokenExpired", { name });
  }
  if (signal.kind === "syncFailed") {
    return t("dashboard.attention.bambuSyncFailed", { name, reason: signal.reason });
  }
  return t("dashboard.attention.bambuTokenExpiresSoon", { name, days: signal.days });
}

// Signale aus dem Betrieb (Sicherung, Bambu-Cloud) als Zeilen fuer "Braucht Aufmerksamkeit" auf dem Dashboard.
export function useSystemAttention(selectedId: string | null): AttentionItem[] {
  const { t } = useTranslation();
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  const backup = useBackupSignal(isAdmin);
  const bambu = useBambuSignals(selectedId);

  const items: AttentionItem[] = [];
  if (backup) {
    items.push({
      key: "backup",
      severity: "warning",
      text: backup.kind === "never" ? t("dashboard.attention.backupNever") : t("dashboard.attention.backupStale", { days: backup.days }),
      to: "/settings"
    });
  }
  for (const { inventoryId, inventoryName, signal } of bambu) {
    items.push({
      key: `bambu-${inventoryId}`,
      severity: signal.kind === "tokenExpiresSoon" ? "warning" : "danger",
      text: bambuText(t, inventoryName, signal),
      to: "/spools"
    });
  }
  return items;
}
