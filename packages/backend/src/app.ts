import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { authRateLimiter, apiRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { setupRouter } from "./routes/setup.js";
import { usersRouter } from "./routes/users.js";
import { settingsRouter } from "./routes/settings.js";
import { backupsRouter } from "./routes/backups.js";
import { auditRouter } from "./routes/audit.js";
import { materialsRouter } from "./routes/materials.js";
import { manufacturersRouter } from "./routes/manufacturers.js";
import { inventoriesRouter } from "./routes/inventories.js";
import { bambuImportRouter } from "./routes/bambuImport.js";
import { bambuConnectionRouter } from "./routes/bambuConnection.js";
import { spoolsRouter } from "./routes/spools.js";
import { spoolPhotosRouter } from "./routes/spoolPhotos.js";
import { printersRouter } from "./routes/printers.js";
import { sendData } from "./lib/apiResult.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  // Sicherheits-Middleware zuerst, dann Routen (siehe CLAUDE.md).
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(apiRateLimiter);

  app.get("/api/health", (_req, res) => {
    sendData(res, { status: "ok", version: process.env.npm_package_version ?? "0.0.1" });
  });

  app.use("/api/auth", authRateLimiter, authRouter);
  app.use("/api/setup", authRateLimiter, setupRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/audit-log", auditRouter);
  app.use("/api/settings/backups", backupsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/materials", materialsRouter);
  app.use("/api/manufacturers", manufacturersRouter);
  app.use("/api/inventories/:id/bambu-import", bambuConnectionRouter);
  app.use("/api/inventories/:id/bambu-import", bambuImportRouter);
  app.use("/api/inventories", inventoriesRouter);
  app.use("/api/spools", spoolPhotosRouter);
  app.use("/api/spools", spoolsRouter);
  app.use("/api/printers", printersRouter);

  app.use(errorHandler);

  return app;
}
