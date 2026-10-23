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
import { statsRouter } from "./routes/stats.js";
import { spoolsRouter } from "./routes/spools.js";
import { spoolPhotosRouter } from "./routes/spoolPhotos.js";
import { spoolDryingRouter } from "./routes/spoolDrying.js";
import { spoolWeighRouter } from "./routes/spoolWeigh.js";
import { spoolsBulkRouter } from "./routes/spoolsBulk.js";
import { spoolmanImportRouter } from "./routes/spoolmanImport.js";
import { inventoryAuditRouter } from "./routes/inventoryAudit.js";
import { printersRouter } from "./routes/printers.js";
import { printJobsRouter } from "./routes/printJobs.js";
import { customFieldDefinitionsRouter } from "./routes/customFieldDefinitions.js";
import { wishlistRouter } from "./routes/wishlist.js";
import { sizzleProductsRouter } from "./routes/sizzleProducts.js";
import { sizzleWishesRouter } from "./routes/sizzleWishes.js";
import { sizzleCostsRouter } from "./routes/sizzleCosts.js";
import { requireFilamentAccess } from "./middleware/access.js";
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
  // Filamentverwaltung: nur mit Freigabe (Super-Admins immer), siehe middleware/access.ts
  const filament = requireFilamentAccess;
  app.use("/api/materials", ...filament, materialsRouter);
  app.use("/api/manufacturers", ...filament, manufacturersRouter);
  app.use("/api/inventories/:id/bambu-import", ...filament, bambuConnectionRouter);
  app.use("/api/inventories/:id/bambu-import", ...filament, bambuImportRouter);
  app.use("/api/inventories/:id/spoolman-import", ...filament, spoolmanImportRouter);
  app.use("/api/inventories/:id/audit-log", ...filament, inventoryAuditRouter);
  app.use("/api/inventories", ...filament, inventoriesRouter);
  app.use("/api/stats", ...filament, statsRouter);
  app.use("/api/spools", ...filament, spoolPhotosRouter);
  app.use("/api/spools", ...filament, spoolDryingRouter);
  app.use("/api/spools", ...filament, spoolWeighRouter);
  app.use("/api/spools", ...filament, spoolsBulkRouter);
  app.use("/api/spools", ...filament, spoolsRouter);
  app.use("/api/printers", ...filament, printersRouter);
  app.use("/api/print-jobs", ...filament, printJobsRouter);
  app.use("/api/custom-field-definitions", ...filament, customFieldDefinitionsRouter);
  app.use("/api/wishlist", ...filament, wishlistRouter);
  // SizzleBrothers-Wunschliste: eigene Freigabe, die die Routen selbst verlangen (requireSizzleAccess)
  app.use("/api/sizzle/products", sizzleProductsRouter);
  app.use("/api/sizzle/wishes", sizzleWishesRouter);
  app.use("/api/sizzle/costs", sizzleCostsRouter);

  app.use(errorHandler);

  return app;
}
