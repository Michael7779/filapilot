import { useCallback, useMemo, useState } from "react";
import type { SpoolWithRelations } from "@filapilot/shared";
import type { SpoolOpenedTab } from "../components/SpoolOpenedTabs.js";

export interface SpoolOpenedTabsState {
  openedTab: SpoolOpenedTab;
  setOpenedTab: (tab: SpoolOpenedTab) => void;
  startedSpools: SpoolWithRelations[];
  unopenedSpools: SpoolWithRelations[];
  // Tabs gibt es nur, wenn beide Gruppen Spulen haben; sonst steht einfach die ganze (eine) Gruppe da.
  showTabs: boolean;
  tabSpools: SpoolWithRelations[];
  // Die Spulen, die seitenweise angezeigt werden (Spulen des gewaehlten Tabs bzw. alle).
  listSpools: SpoolWithRelations[];
  // Fuer "Springe zu dieser Spule": die Liste, in der die Spule steht, und der Wechsel auf ihren Tab.
  listFor: (spool: SpoolWithRelations) => readonly SpoolWithRelations[];
  showTabOf: (spool: SpoolWithRelations) => void;
}

// Teilt die sichtbaren Spulen in die Tabs "Angefangene" und "Ungeoeffnete" (Reihenfolge der Sortierung bleibt je Tab erhalten).
export function useSpoolOpenedTabs(visibleSpools: SpoolWithRelations[], onTabChange: () => void): SpoolOpenedTabsState {
  const [openedTab, setOpenedTabState] = useState<SpoolOpenedTab>("started");
  const setOpenedTab = useCallback(
    (tab: SpoolOpenedTab): void => {
      setOpenedTabState(tab);
      onTabChange();
    },
    [onTabChange]
  );
  const startedSpools = useMemo(() => visibleSpools.filter((spool) => spool.openedAt), [visibleSpools]);
  const unopenedSpools = useMemo(() => visibleSpools.filter((spool) => !spool.openedAt), [visibleSpools]);
  const showTabs = startedSpools.length > 0 && unopenedSpools.length > 0;
  const tabSpools = openedTab === "started" ? startedSpools : unopenedSpools;
  const listFor = useCallback(
    (spool: SpoolWithRelations): readonly SpoolWithRelations[] => {
      if (!showTabs) {
        return visibleSpools;
      }
      return spool.openedAt ? startedSpools : unopenedSpools;
    },
    [showTabs, startedSpools, unopenedSpools, visibleSpools]
  );
  const showTabOf = useCallback((spool: SpoolWithRelations): void => setOpenedTabState(spool.openedAt ? "started" : "unopened"), []);

  return { openedTab, setOpenedTab, startedSpools, unopenedSpools, showTabs, tabSpools, listSpools: showTabs ? tabSpools : visibleSpools, listFor, showTabOf };
}
