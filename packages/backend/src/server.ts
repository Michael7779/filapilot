import { createServer } from "node:http";
import { createApp } from "./app.js";
import { attachSocketServer } from "./socket.js";
import { startDailyBackupScheduler } from "./services/backupScheduler.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const app = createApp();
const httpServer = createServer(app);
attachSocketServer(httpServer);
startDailyBackupScheduler();

httpServer.listen(env.PORT, () => {
  logger.info(`FilaPilot backend laeuft auf Port ${env.PORT}`);
});
