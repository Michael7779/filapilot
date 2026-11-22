import { execFile as execFileCallback } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { logger } from "../logger.js";

const execFile = promisify(execFileCallback);

export interface SchemaBootstrapDependencies {
  // Anzahl der Tabellen im Schema "public" der Datenbank
  countTables: () => Promise<number>;
  // Legt das Schema aus prisma/schema.prisma an
  pushSchema: () => Promise<void>;
}

// Der Aufruf ist fest verdrahtet: ohne Shell, ohne Eingaben von aussen, und NIE mit --accept-data-loss oder --force-reset.
// Das Update-Skript (scripts/update-synology.sh) nutzt dieselbe Prisma-Funktion fuer bestehende Datenbanken und bricht bei
// einer datenverlust-traechtigen Aenderung bewusst ab - dieser Weg hier ist nur fuer die leere Datenbank gedacht.
export function buildPushCommand(): { command: string; args: string[] } {
  // Das Prisma-Programm direkt ueber Node starten (nicht ueber node_modules/.bin): funktioniert auf Linux und Windows ohne Shell.
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  return { command: process.execPath, args: [prismaCli, "db", "push", "--schema=prisma/schema.prisma", "--skip-generate"] };
}

export async function pushSchemaWithCli(databaseUrl: string | undefined = process.env.DATABASE_URL): Promise<void> {
  const { command, args } = buildPushCommand();
  const { stdout } = await execFile(command, args, {
    env: { ...process.env, ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}) },
    maxBuffer: 5 * 1024 * 1024
  });
  logger.info("Datenbank-Schema angelegt", { output: stdout.trim().slice(-300) });
}

interface RawQueryClient {
  $queryRaw: <T = unknown>(query: TemplateStringsArray) => Promise<T>;
}

export async function countPublicTables(client: RawQueryClient): Promise<number> {
  const rows = await client.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public'`;
  return Number(rows[0]?.count ?? 0);
}

// Frische Installation: Hat die Datenbank noch gar keine Tabellen, legt der Start das Schema selbst an - die Installationsanleitung
// braucht dafuer keine eigene Aufgabe mehr. Eine Datenbank mit irgendwelchen Tabellen wird NIE angefasst; Aenderungen an einer
// bestehenden Installation laufen weiter ausschliesslich ueber das Update-Skript bzw. die Wiederherstellung.
export async function ensureDatabaseSchema(deps: SchemaBootstrapDependencies): Promise<"created" | "present"> {
  if ((await deps.countTables()) > 0) {
    return "present";
  }
  logger.info("Datenbank ist leer - lege das Schema an (frische Installation)");
  await deps.pushSchema();
  if ((await deps.countTables()) === 0) {
    throw new Error("Das Anlegen des Datenbank-Schemas meldete Erfolg, aber die Datenbank hat danach keine Tabellen.");
  }
  return "created";
}
