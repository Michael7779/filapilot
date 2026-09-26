import { createServer } from "node:http";
import { createApp } from "./app.js";
import { attachSocketServer } from "./socket.js";
import { startDailyBackupScheduler } from "./services/backupScheduler.js";
import { connectAllPrinters } from "./services/printerRuntime.js";
import { ensureDefaultInventory } from "./services/inventoryService.js";
import { runWithStartupRetry } from "./lib/startupRetry.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const STARTUP_ATTEMPTS = 24;
const STARTUP_RETRY_DELAY_MS = 5000;

const app = createApp();
const httpServer = createServer(app);
attachSocketServer(httpServer);
startDailyBackupScheduler();

// Erst das Hauptlager sicherstellen (Spulen/Drucker ohne Lager zuordnen), dann die Drucker verbinden. Direkt nach einem Update
// fehlen der Datenbank evtl. noch Tabellen (das Update-Skript gleicht sie erst nach dem Start ab) - dann wird es wiederholt.
runWithStartupRetry(
  async () => {
    await ensureDefaultInventory();
    await connectAllPrinters();
  },
  {
    attempts: STARTUP_ATTEMPTS,
    delayMs: STARTUP_RETRY_DELAY_MS,
    onRetry: (attempt, err) => {
      logger.warn("Lager oder Drucker konnten beim Start noch nicht vorbereitet werden (Datenbank-Schema noch nicht abgeglichen?) - neuer Versuch", {
        attempt,
        err
      });
    },
    onGiveUp: (err) => {
      logger.error("Konnte Lager oder gespeicherte Drucker beim Start nicht vorbereiten", { err });
    }
  }
);

httpServer.listen(env.PORT, () => {
  logger.info(`FilaPilot backend laeuft auf Port ${env.PORT}`);
});
