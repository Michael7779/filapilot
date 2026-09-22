import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { authRateLimiter, apiRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { settingsRouter } from "./routes/settings.js";
import { sendData } from "./lib/apiResult.js";

export function createApp() {
  const app = express();

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
  app.use("/api/users", usersRouter);
  app.use("/api/settings", settingsRouter);

  app.use(errorHandler);

  return app;
}
