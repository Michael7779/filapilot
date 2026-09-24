import { AppError } from "../lib/apiResult.js";

let busy = false;

// Verhindert, dass Sicherung und Wiederherstellung (oder zwei Wiederherstellungen) gleichzeitig laufen.
export function acquireBackupLock(): () => void {
  if (busy) {
    throw new AppError("CONFLICT", "Es laeuft bereits eine Sicherung oder Wiederherstellung.");
  }
  busy = true;
  return () => {
    busy = false;
  };
}

export async function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const release = acquireBackupLock();
  try {
    return await task();
  } finally {
    release();
  }
}
