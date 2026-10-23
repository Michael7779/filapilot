import type { SizzleRefreshPhase, SizzleRefreshStatus } from "@filapilot/shared";

// Ab so vielen Sekunden weisen wir darauf hin, dass es laenger als ueblich dauert (langsame Verbindung)
export const SLOW_AFTER_SECONDS = 8;
// So lange bleibt "Fertig" sichtbar, danach zeigt die Anzeige wieder nur den Stand
export const DONE_VISIBLE_MS = 6000;

export type RefreshStage = "idle" | "running" | "slow" | "done" | "cancelled" | "error";

interface StageInput {
  status: SizzleRefreshStatus | null;
  elapsedSeconds: number;
  // Der Benutzer hat abgebrochen: das gilt sofort, auch wenn der Server (z.B. wegen schlechter Verbindung) noch nichts davon weiss
  cancelledLocally: boolean;
  // Mehrere Abfragen des Stands in Folge sind fehlgeschlagen
  connectionLost: boolean;
  doneVisible: boolean;
}

// Aus dem Stand des Servers und dem, was der Browser selbst weiss, die Anzeige ableiten.
export function deriveRefreshStage({ status, elapsedSeconds, cancelledLocally, connectionLost, doneVisible }: StageInput): RefreshStage {
  if (cancelledLocally) {
    return "cancelled";
  }
  switch (status?.state) {
    case "running":
      return connectionLost || elapsedSeconds >= SLOW_AFTER_SECONDS ? "slow" : "running";
    case "done":
      return doneVisible ? "done" : "idle";
    case "cancelled":
    case "error":
      return status.state;
    default:
      return "idle";
  }
}

export function stepIndex(phase: SizzleRefreshPhase | null): 0 | 1 | 2 {
  if (phase === "parse") {
    return 1;
  }
  return phase === "save" ? 2 : 0;
}

const PHASE_PERCENT: Record<SizzleRefreshPhase, number> = { fetch: 25, parse: 60, save: 90 };

// Balken: kein echter Prozentwert, sondern der erreichte Schritt (der Abruf beim Shop ist der unberechenbare Teil).
export function progressPercent(stage: RefreshStage, phase: SizzleRefreshPhase | null): number {
  if (stage === "done") {
    return 100;
  }
  if (stage === "idle") {
    return 0;
  }
  return PHASE_PERCENT[phase ?? "fetch"];
}
