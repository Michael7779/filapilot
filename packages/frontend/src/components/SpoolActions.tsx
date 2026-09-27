import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SpoolWithRelations } from "@filapilot/shared";

export interface SpoolHandlers {
  canEdit: boolean;
  onEdit: (spool: SpoolWithRelations) => void;
  onArchive: (spool: SpoolWithRelations, archive: boolean) => void;
  onLabel: (spool: SpoolWithRelations) => void;
  onDelete: (spool: SpoolWithRelations) => void;
}

interface SpoolActionsProps extends SpoolHandlers {
  spool: SpoolWithRelations;
  // inline = Textknoepfe nebeneinander, menu = Drei-Punkte-Menue (platzsparend)
  variant: "inline" | "menu";
}

interface ActionItem {
  key: string;
  label: string;
  danger?: boolean;
  run: () => void;
}

// Aktionen einer Spule; Betrachter sehen nur das QR-Label.
export function SpoolActions({ spool, variant, canEdit, onEdit, onArchive, onLabel, onDelete }: SpoolActionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function onPointer(event: MouseEvent): void {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
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
  if (canEdit) {
    items.push({ key: "delete", label: t("common.delete"), danger: true, run: () => onDelete(spool) });
  }

  if (variant === "inline") {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.run}
            className={`text-xs font-medium ${item.danger ? "text-[var(--color-danger)]" : ""}`}
            style={item.danger ? undefined : { color: "var(--accent)" }}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
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
      {open && (
        <ul className="absolute right-0 z-20 mt-1 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-white py-1 text-sm">
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
        </ul>
      )}
    </div>
  );
}
