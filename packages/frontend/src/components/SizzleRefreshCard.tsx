import { useTranslation } from "react-i18next";
import type { SizzleRefreshPhase } from "@filapilot/shared";
import type { SizzleRefreshView } from "../hooks/useSizzleRefresh.js";
import { progressPercent, stepIndex, type RefreshStage } from "../lib/sizzleRefresh.js";
import { refreshText } from "../lib/sizzleRefreshText.js";
import { CheckIcon, CircleIcon, CrossIcon, RefreshIcon, SpinnerIcon } from "./SizzleRefreshIcons.js";

interface SizzleRefreshCardProps {
  view: SizzleRefreshView;
  syncedAt: Date | string | null;
  onRefresh: () => void;
  onCancel: () => void;
}

const STEPS: SizzleRefreshPhase[] = ["fetch", "parse", "save"];
const ACTIVE_STAGES: RefreshStage[] = ["running", "slow"];
const BUTTON = "rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm font-medium";

// Farbe je Zustand (Balken und Text)
function tone(stage: RefreshStage): string {
  switch (stage) {
    case "slow":
      return "var(--color-warning)";
    case "done":
      return "var(--color-success)";
    case "error":
      return "var(--color-danger)";
    case "cancelled":
      return "var(--color-text-muted)";
    default:
      return "var(--accent)";
  }
}

function StepRow({ step, view }: { step: number; view: SizzleRefreshView }): React.JSX.Element {
  const { t } = useTranslation();
  const { stage } = view;
  const current = stepIndex(view.phase);
  const finished = stage === "done" || step < current;
  const failed = stage === "error" && step === current;
  const active = ACTIVE_STAGES.includes(stage) && step === current;
  let icon = <CircleIcon className="text-[var(--color-text-muted)]" />;
  if (finished) {
    icon = <CheckIcon className="text-[var(--color-success)]" />;
  } else if (failed) {
    icon = <CrossIcon className="text-[var(--color-danger)]" />;
  } else if (active) {
    icon = <SpinnerIcon />;
  }
  return (
    <li className={`flex items-center gap-2 text-sm ${finished || active ? "" : "text-[var(--color-text-muted)]"}`} aria-current={active ? "step" : undefined}>
      {icon}
      {t(`sizzle.refresh.steps.${STEPS[step] ?? "fetch"}`)}
    </li>
  );
}

// Desktop-Darstellung der Aktualisierung (Variante B): im Ruhezustand eine Zeile mit Knopf, waehrend des Abgleichs eine Karte mit
// den drei Schritten, Sekundenzaehler und "Abbrechen"; bei einer langsamen Verbindung mit Hinweis.
export function SizzleRefreshCard({ view, syncedAt, onRefresh, onCancel }: SizzleRefreshCardProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const text = refreshText(t, view, syncedAt, i18n.language);
  const { stage } = view;

  if (stage === "idle") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-[var(--color-text-secondary)]">{text}</span>
        <button type="button" onClick={onRefresh} className={`${BUTTON} flex items-center gap-1.5`}>
          <RefreshIcon />
          {t("sizzle.refresh.button")}
        </button>
      </div>
    );
  }

  const running = ACTIVE_STAGES.includes(stage);
  const color = tone(stage);
  return (
    <section aria-label={t("sizzle.refresh.title")} className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t("sizzle.refresh.title")}</h3>
        {running ? (
          <button type="button" onClick={onCancel} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            {t("sizzle.refresh.cancel")}
          </button>
        ) : (
          stage !== "done" && (
            <button type="button" onClick={onRefresh} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              {t("sizzle.refresh.retry")}
            </button>
          )
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent(stage, view.phase)} aria-label={t("sizzle.refresh.title")}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progressPercent(stage, view.phase)}%`, backgroundColor: color }} />
      </div>
      <ol className="flex flex-col gap-1">
        {STEPS.map((phase, index) => (
          <StepRow key={phase} step={index} view={view} />
        ))}
      </ol>
      <p role={stage === "running" ? undefined : "status"} className="text-xs" style={{ color: stage === "running" ? "var(--color-text-secondary)" : color }}>
        {text}
      </p>
    </section>
  );
}
