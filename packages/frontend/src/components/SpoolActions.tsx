import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { SpoolWithRelations } from "@filapilot/shared";

export interface SpoolHandlers {
  canEdit: boolean;
  onEdit: (spool: SpoolWithRelations) => void;
  onArchive: (spool: SpoolWithRelations, archive: boolean) => void;
  onLabel: (spool: SpoolWithRelations) => void;
  onDelete: (spool: SpoolWithRelations) => void;
  onHistory: (spool: SpoolWithRelations) => void;
  onAddToWishlist: (spool: SpoolWithRelations) => void;
  onDrying: (spool: SpoolWithRelations) => void;
}

interface SpoolActionsProps extends SpoolHandlers {
  spool: SpoolWithRelations;
}

interface ActionItem {
  key: string;
  label: string;
  danger?: boolean;
  run: () => void;
}

const MENU_WIDTH = 180;

// Aktionen einer Spule (Drei-Punkte-Menue); Betrachter sehen nur das QR-Label.
export function SpoolActions({ spool, canEdit, onEdit, onArchive, onLabel, onDelete, onHistory, onAddToWishlist, onDrying }: SpoolActionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    // Feste Position statt "absolute": das Menue wird ans Ende von <body> gerendert, damit es nie von einem
    // scrollenden Vorfahren (z.B. der seitlich scrollenden Tabelle in der Listenansicht) abgeschnitten wird.
    function place(): void {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - MENU_WIDTH) });
    }
    place();
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function onPointer(event: MouseEvent): void {
      const target = event.target;
      const insideRoot = rootRef.current && target instanceof Node && rootRef.current.contains(target);
      const insideMenu = menuRef.current && target instanceof Node && menuRef.current.contains(target);
      if (!insideRoot && !insideMenu) {
        setOpen(false);
      }
    }
    // Bei Scroll/Resize schliessen statt der Position nachzufuehren (einfacher, und das Menue ist ohnehin kurzlebig).
    // "true" (capture) faengt auch das Scrollen eines inneren Containers ab (z.B. der Tabelle), das sonst nicht bis zum Fenster durchreicht.
    function onDismiss(): void {
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [open]);

  const items: ActionItem[] = [];
  if (canEdit) {
    items.push({ key: "edit", label: t("common.edit"), run: () => onEdit(spool) });
    items.push({
      key: "archive",
      label: spool.archivedAt ? t("spools.unarchive") : t("spools.archive"),
      run: () => onArchive(spool, !spool.archivedAt)
    });
  }
  items.push({ key: "label", label: t("spools.qrLabel"), run: () => onLabel(spool) });
  items.push({ key: "history", label: t("spools.history.action"), run: () => onHistory(spool) });
  items.push({ key: "drying", label: t("spools.drying.action"), run: () => onDrying(spool) });
  items.push({ key: "wishlist", label: t("spools.addToWishlist"), run: () => onAddToWishlist(spool) });
  if (canEdit) {
    items.push({ key: "delete", label: t("common.delete"), danger: true, run: () => onDelete(spool) });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("spools.actions")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open &&
        menuPos &&
        createPortal(
          <ul
            ref={menuRef}
            className="fixed z-50 rounded-lg border border-[var(--color-border)] bg-white py-1 text-sm shadow-lg"
            style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
          >
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.run();
                  }}
                  className={`block w-full px-3 py-1.5 text-left hover:bg-[var(--color-bg)] ${item.danger ? "text-[var(--color-danger)]" : ""}`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
