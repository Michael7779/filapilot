import { useCallback, useEffect, useRef, useState } from "react";
import type { SizzleRefreshPhase, SizzleRefreshStatus } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { DONE_VISIBLE_MS, deriveRefreshStage, type RefreshStage } from "../lib/sizzleRefresh.js";

const POLL_MS = 1000;
// So viele Abfragen des Stands in Folge duerfen fehlschlagen, bevor wir "Verbindung unterbrochen" annehmen
const LOST_AFTER_FAILURES = 3;
const CANCEL_TIMEOUT_MS = 5000;

export interface SizzleRefreshView {
  stage: RefreshStage;
  // Aktueller (bzw. zuletzt erreichter) Schritt
  phase: SizzleRefreshPhase | null;
  elapsedSeconds: number;
  // Dauer eines fertigen Abgleichs und Anzahl der Produktvarianten
  durationSeconds: number | null;
  total: number | null;
  message: string | null;
  connectionLost: boolean;
  // auto = beim Oeffnen der Seite (nur wenn der letzte Abgleich laenger her ist), sonst per Knopf (immer)
  start: (auto: boolean) => Promise<void>;
  cancel: () => void;
}

// Steuert die Aktualisierung des Sizzle-Katalogs vom Browser aus: startet sie, fragt den Stand ab und bricht sie auf Wunsch ab.
// onFinished wird einmal aufgerufen, wenn ein beobachteter Abgleich erfolgreich fertig ist (dann Katalog und Wuensche neu laden).
export function useSizzleRefresh(onFinished: () => void): SizzleRefreshView {
  const [status, setStatus] = useState<SizzleRefreshStatus | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cancelledLocally, setCancelledLocally] = useState(false);
  const [failures, setFailures] = useState(0);
  const [doneVisible, setDoneVisible] = useState(false);
  const [lastPhase, setLastPhase] = useState<SizzleRefreshPhase | null>(null);
  const finishedCallback = useRef(onFinished);
  const previousState = useRef<SizzleRefreshStatus["state"] | null>(null);
  const watchStartedAt = useRef(0);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const watching = status?.state === "running" && !cancelledLocally;

  useEffect(() => {
    finishedCallback.current = onFinished;
  }, [onFinished]);

  useEffect(() => () => clearTimeout(doneTimer.current), []);

  const applyStatus = useCallback((next: SizzleRefreshStatus): void => {
    if (next.phase) {
      setLastPhase(next.phase);
    }
    if (previousState.current === "running" && next.state === "done") {
      setDoneVisible(true);
      clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setDoneVisible(false), DONE_VISIBLE_MS);
      finishedCallback.current();
    }
    previousState.current = next.state;
    setStatus(next);
  }, []);

  const start = useCallback(
    async (auto: boolean): Promise<void> => {
      setCancelledLocally(false);
      setFailures(0);
      setDoneVisible(false);
      try {
        const next = await apiRequest<SizzleRefreshStatus>("/sizzle/products/refresh", { method: "POST", body: JSON.stringify({ auto }) });
        if (next.state === "running") {
          watchStartedAt.current = Date.now();
          setElapsedSeconds(0);
        } else if (auto) {
          // Beim Oeffnen der Seite war nichts faellig: kein alter Stand (z.B. ein Fehler von vorhin) anzeigen
          previousState.current = null;
          setStatus(null);
          return;
        }
        applyStatus(next);
      } catch (err) {
        previousState.current = "error";
        setStatus({ state: "error", phase: null, startedAt: null, finishedAt: null, total: null, message: err instanceof ApiRequestError ? err.message : null });
      }
    },
    [applyStatus]
  );

  const poll = useCallback(async (): Promise<void> => {
    setElapsedSeconds(Math.floor((Date.now() - watchStartedAt.current) / 1000));
    try {
      applyStatus(await apiRequest<SizzleRefreshStatus>("/sizzle/products/refresh"));
      setFailures(0);
    } catch {
      // Eine einzelne fehlgeschlagene Abfrage ist bei schlechter Verbindung normal; erst mehrere in Folge zaehlen als unterbrochen
      setFailures((count) => count + 1);
    }
  }, [applyStatus]);

  useEffect(() => {
    if (!watching) {
      return undefined;
    }
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [watching, poll]);

  const cancel = useCallback((): void => {
    // Gilt sofort in der Anzeige. Dem Server sagen wir es nach Kraeften: ist die Verbindung so schlecht, dass das nicht ankommt, endet
    // der Abgleich dort von selbst (Zeitlimit des Abrufs) und aendert den Katalog nur, wenn er vollstaendig war.
    setCancelledLocally(true);
    apiRequest("/sizzle/products/refresh/cancel", { method: "POST", signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS) }).catch(() => undefined);
  }, []);

  const connectionLost = failures >= LOST_AFTER_FAILURES;
  const durationSeconds =
    status?.state === "done" && status.startedAt && status.finishedAt ? (new Date(status.finishedAt).getTime() - new Date(status.startedAt).getTime()) / 1000 : null;

  return {
    stage: deriveRefreshStage({ status, elapsedSeconds, cancelledLocally, connectionLost, doneVisible }),
    phase: status?.phase ?? lastPhase,
    elapsedSeconds,
    durationSeconds,
    total: status?.total ?? null,
    message: status?.message ?? null,
    connectionLost,
    start,
    cancel
  };
}
