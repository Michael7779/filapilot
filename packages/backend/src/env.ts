import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  // Anzahl vorgeschalteter Proxys (Synology-Reverse-Proxy + Frontend-nginx), damit das Rate-Limit
  // die echte Client-Adresse aus X-Forwarded-For nutzt.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(2),
  BACKUP_FOLDER_PATH: z.string().default("/data/backups")
});

export const env = envSchema.parse(process.env);
