export interface StartupRetryOptions {
  attempts: number;
  delayMs: number;
  onRetry: (attempt: number, err: unknown) => void;
  onGiveUp: (err: unknown) => void;
}

// Fuehrt eine Startaufgabe aus und versucht es bei einem Fehler nach einer Wartezeit erneut (per Timer, nicht blockierend).
// Gedacht fuer den Start direkt nach einem Update: Das Update-Skript startet die Container zuerst und gleicht die Datenbank
// erst danach ab - in den ersten Sekunden fehlen dem neuen Programm also noch Tabellen oder Spalten.
export function runWithStartupRetry(task: () => Promise<void>, options: StartupRetryOptions, attempt = 1): void {
  task().catch((err: unknown) => {
    if (attempt >= options.attempts) {
      options.onGiveUp(err);
      return;
    }
    options.onRetry(attempt, err);
    setTimeout(() => runWithStartupRetry(task, options, attempt + 1), options.delayMs);
  });
}
