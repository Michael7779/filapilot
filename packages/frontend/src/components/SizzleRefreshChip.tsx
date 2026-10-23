import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SizzleRefreshView } from "../hooks/useSizzleRefresh.js";
import type { RefreshStage } from "../lib/sizzleRefresh.js";
import { formatChipTime, refreshText } from "../lib/sizzleRefreshText.js";
import { CheckIcon, CrossIcon, RefreshIcon, SpinnerIcon } from "./SizzleRefreshIcons.js";

interface SizzleRefreshChipProps {
  view: SizzleRefreshView;
  syncedAt: Date | string | null;
  onRefresh: () => void;
  onCancel: () => void;
}

// Farben der Marke je Zustand
const CHIP_STYLE: Partial<Record<RefreshStage, { background: string; color: string; borderColor: string }>> = {
  slow: { background: "var(--color-warning-bg)", color: "var(--color-warning)", borderColor: "var(--color-warning)" },
  done: { background: "#e3f4e8", color: "var(--color-success)", borderColor: "var(--color-success)" },
  error: { background: "#fdecea", color: "var(--color-danger)", borderColor: "var(--color-danger)" }
};

function ChipContent({ view, syncedAt }: { view: SizzleRefreshView; syncedAt: Date | string | null }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  switch (view.stage) {
    case "running":
    case "slow":
      return (
        <>
          <SpinnerIcon size={14} />
          <span className="tabular-nums">{t("sizzle.refresh.chipRunning", { seconds: view.elapsedSeconds })}</span>
        </>
      );
    case "done":
      return (
        <>
          <CheckIcon size={14} />
          {t("sizzle.refresh.chipDone")}
        </>
      );
    case "error":
      return (
        <>
          <CrossIcon size={14} />
          {t("sizzle.refresh.chipError")}
        </>
      );
    case "cancelled":
      return <>{t("sizzle.refresh.chipCancelled")}</>;
    default:
      return (
        <>
          <RefreshIcon size={14} />
          {syncedAt ? t("sizzle.refresh.chipSynced", { time: formatChipTime(syncedAt, i18n.language) }) : t("sizzle.refresh.button")}
        </>
      );
  }
}

// Handy-Darstellung der Aktualisierung (Variante C): eine kleine Marke neben dem Knopf. Im Ruhezustand ist die Marke selbst der Knopf
// zum Aktualisieren; waehrend des Abgleichs (und bei Abbruch oder Fehler) oeffnet ein Tipp darauf ein Feld mit Details und "Abbrechen"
// bzw. "Erneut versuchen". Bei einer langsamen Verbindung oder einem Fehler oeffnet sich das Feld von selbst. Das Feld ist an der
// naechsten positionierten Umgebung verankert (relative) und fuellt deren Breite - so ragt es am schmalen Handy nie aus dem Bild.
export function SizzleRefreshChip({ view, syncedAt, onRefresh, onCancel }: SizzleRefreshChipProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const { stage } = view;
  const running = stage === "running" || stage === "slow";

  useEffect(() => {
    setOpen(stage === "slow" || stage === "error");
  }, [stage]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function handlePointerDown(event: PointerEvent): void {
      if (container.current && event.target instanceof Node && !container.current.contains(event.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  function handleClick(): void {
    if (stage === "idle") {
      onRefresh();
    } else if (stage !== "done") {
      setOpen((current) => !current);
    }
  }

  return (
    <div ref={container}>
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={stage === "idle" || stage === "done" ? undefined : open}
        aria-label={stage === "idle" ? t("sizzle.refresh.button") : undefined}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]"
        style={CHIP_STYLE[stage]}
      >
        <ChipContent view={view} syncedAt={syncedAt} />
      </button>
      {open && stage !== "idle" && stage !== "done" && (
        <div role="status" className="absolute inset-x-0 top-full z-30 mt-2 rounded-xl border border-[var(--color-border)] bg-white p-3 text-sm">
          <p className="font-medium">{t(`sizzle.refresh.popover.${stage}`)}</p>
          <p className="mt-1 text-[var(--color-text-secondary)]">{refreshText(t, view, syncedAt, i18n.language)}</p>
          {running && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t("sizzle.refresh.keepWorking")}</p>}
          <div className="mt-2 flex gap-4 text-sm font-medium" style={{ color: "var(--accent)" }}>
            {running ? (
              <button type="button" onClick={onCancel}>
                {t("sizzle.refresh.cancel")}
              </button>
            ) : (
              <button type="button" onClick={onRefresh}>
                {t("sizzle.refresh.retry")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
