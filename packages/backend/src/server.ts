import { createServer } from "node:http";
import { createApp } from "./app.js";
import { attachSocketServer } from "./socket.js";
import { startDailyBackupScheduler } from "./services/backupScheduler.js";
import { connectAllPrinters } from "./services/printerRuntime.js";
import { ensureDefaultInventory } from "./services/inventoryService.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const app = createApp();
const httpServer = createServer(app);
attachSocketServer(httpServer);
startDailyBackupScheduler();
// Erst das Hauptlager sicherstellen (Spulen/Drucker ohne Lager zuordnen), dann die Drucker verbinden.
ensureDefaultInventory()
  .then(() => connectAllPrinters())
  .catch((err: unknown) => {
    logger.error("Konnte Lager oder gespeicherte Drucker beim Start nicht vorbereiten", { err });
  });

httpServer.listen(env.PORT, () => {
  logger.info(`FilaPilot backend laeuft auf Port ${env.PORT}`);
});
