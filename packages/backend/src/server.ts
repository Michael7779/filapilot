import { createServer } from "node:http";
import { createApp } from "./app.js";
import { attachSocketServer } from "./socket.js";
import { startDailyBackupScheduler } from "./services/backupScheduler.js";
import { startBambuAutoSync } from "./services/bambuAutoSync.js";
import { connectAllPrinters } from "./services/printerRuntime.js";
import { ensureDefaultInventory } from "./services/inventoryService.js";
import { ensureOpenedAtBackfilled } from "./services/openedAtBackfill.js";
import { ensureSuperAdmin } from "./services/superAdminService.js";
import { startSizzleCatalogScheduler } from "./services/sizzleCatalogScheduler.js";
import { runWithStartupRetry } from "./lib/startupRetry.js";
import { countPublicTables, ensureDatabaseSchema, pushSchemaWithCli } from "./services/schemaBootstrap.js";
import { prisma } from "./prisma.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const STARTUP_ATTEMPTS = 24;
const STARTUP_RETRY_DELAY_MS = 5000;

const app = createApp();
const httpServer = createServer(app);
attachSocketServer(httpServer);
startDailyBackupScheduler();
startBambuAutoSync();
// Produkte des SizzleBrothers-Shops regelmaessig abgleichen (beim Start und danach alle paar Stunden)
startSizzleCatalogScheduler();

// Erst bei einer frischen Installation das Schema anlegen (nur in einer komplett leeren Datenbank), dann das Hauptlager
// sicherstellen und die Drucker verbinden. Bei einem Fehler (z.B. Datenbank noch nicht bereit) wird es wiederholt.
runWithStartupRetry(
  async () => {
    await ensureDatabaseSchema({ countTables: () => countPublicTables(prisma), pushSchema: () => pushSchemaWithCli() });
    await ensureDefaultInventory();
    await ensureOpenedAtBackfilled();
    await ensureSuperAdmin();
    await connectAllPrinters();
  },
  {
    attempts: STARTUP_ATTEMPTS,
    delayMs: STARTUP_RETRY_DELAY_MS,
    onRetry: (attempt, err) => {
      logger.warn("Lager oder Drucker konnten beim Start noch nicht vorbereitet werden (Datenbank noch nicht bereit?) - neuer Versuch", {
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
