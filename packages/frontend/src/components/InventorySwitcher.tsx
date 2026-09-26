import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ALL_INVENTORIES, useInventoryStore } from "../stores/useInventoryStore.js";

function Dot({ color }: { color: string }): React.JSX.Element {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
}

interface InventorySwitcherProps {
  // "sidebar": volle Breite; "header": kompakt fuer die Kopfzeile am Handy
  variant: "sidebar" | "header";
}

// Umschalter fuer das aktive Lager. Wer nur in einem Lager ist, sieht dessen Namen ohne Auswahlliste.
export function InventorySwitcher({ variant }: InventorySwitcherProps): React.JSX.Element {
  const { t } = useTranslation();
  const inventories = useInventoryStore((state) => state.inventories);
  const selectedId = useInventoryStore((state) => state.selectedId);
  const select = useInventoryStore((state) => state.select);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function handleClick(event: MouseEvent): void {
      if (container.current && event.target instanceof Node && !container.current.contains(event.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  if (inventories.length === 0) {
    return <></>;
  }

  const isAll = selectedId === ALL_INVENTORIES;
  const current = inventories.find((inventory) => inventory.id === selectedId) ?? inventories[0];
  const label = isAll ? t("inventory.all") : (current?.name ?? "");
  const wide = variant === "sidebar";
  const baseClass = `flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium ${wide ? "w-full" : "max-w-[9rem]"}`;

  if (inventories.length === 1) {
    return (
      <div className={baseClass} title={t("inventory.current")}>
        <Dot color={current?.color ?? "#2F6FED"} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </div>
    );
  }

  return (
    <div ref={container} className={`relative ${wide ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("inventory.switch")}
        className={baseClass}
      >
        {isAll ? (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-text-muted)]" aria-hidden="true" />
        ) : (
          <Dot color={current?.color ?? "#2F6FED"} />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-40 mt-1 w-64 max-w-[80vw] rounded-lg border border-[var(--color-border)] bg-white p-1"
        >
          {inventories.map((inventory) => (
            <button
              key={inventory.id}
              type="button"
              role="option"
              aria-selected={inventory.id === selectedId}
              onClick={() => {
                select(inventory.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-[var(--color-bg)]"
              style={inventory.id === selectedId ? { color: "var(--accent)", fontWeight: 600 } : undefined}
            >
              <Dot color={inventory.color} />
              <span className="min-w-0 flex-1 truncate">{inventory.name}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{inventory.spoolCount}</span>
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={isAll}
            onClick={() => {
              select(ALL_INVENTORIES);
              setOpen(false);
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-[var(--color-border)] px-2.5 py-2 text-left text-sm hover:bg-[var(--color-bg)]"
            style={isAll ? { color: "var(--accent)", fontWeight: 600 } : undefined}
          >
            {t("inventory.all")}
          </button>
          <Link
            to="/settings/lager"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2.5 py-2 text-sm hover:bg-[var(--color-bg)]"
            style={{ color: "var(--accent)" }}
          >
            {t("inventory.manage")}
          </Link>
        </div>
      )}
    </div>
  );
}
