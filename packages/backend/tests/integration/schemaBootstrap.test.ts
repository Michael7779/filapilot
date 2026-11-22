import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { countPublicTables, ensureDatabaseSchema, pushSchemaWithCli } from "../../src/services/schemaBootstrap.js";

// Echte Postgres-Instanz der Tests, aber je Test eine eigene, frisch angelegte Datenbank (nie die Test-Datenbank der anderen Tests).
const EMPTY_DB = "fp_bootstrap_empty";
const FOREIGN_DB = "fp_bootstrap_foreign";

function urlFor(database: string): string {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `/${database}`;
  return url.toString();
}

describe("Schema beim Start auf einer echten, leeren Datenbank", () => {
  let admin: PrismaClient;
  const clients: PrismaClient[] = [];

  function connect(database: string): PrismaClient {
    const client = new PrismaClient({ datasourceUrl: urlFor(database) });
    clients.push(client);
    return client;
  }

  before(async () => {
    admin = new PrismaClient({ datasourceUrl: urlFor("postgres") });
    for (const name of [EMPTY_DB, FOREIGN_DB]) {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.$executeRawUnsafe(`CREATE DATABASE ${name}`);
    }
  });

  after(async () => {
    await Promise.all(clients.map((client) => client.$disconnect()));
    for (const name of [EMPTY_DB, FOREIGN_DB]) {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    await admin.$disconnect();
  });

  it("legt in einer leeren Datenbank alle Tabellen an und ist beim zweiten Start ohne Wirkung", async () => {
    const client = connect(EMPTY_DB);
    const deps = { countTables: () => countPublicTables(client), pushSchema: () => pushSchemaWithCli(urlFor(EMPTY_DB)) };
    assert.equal(await countPublicTables(client), 0);

    assert.equal(await ensureDatabaseSchema(deps), "created");
    const tables = (await client.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`).map(
      (row) => row.table_name
    );
    for (const expected of ["users", "spools", "printers", "inventories", "settings"]) {
      assert.ok(tables.includes(expected), `Tabelle ${expected} fehlt`);
    }

    assert.equal(await ensureDatabaseSchema(deps), "present");
  });

  it("fasst eine Datenbank mit fremden Tabellen nicht an (kein Schema, keine Aenderung)", async () => {
    const client = connect(FOREIGN_DB);
    await client.$executeRawUnsafe("CREATE TABLE fremd (id integer)");
    let pushed = false;
    const result = await ensureDatabaseSchema({
      countTables: () => countPublicTables(client),
      pushSchema: async () => {
        pushed = true;
      }
    });
    assert.equal(result, "present");
    assert.equal(pushed, false);
    assert.equal(await countPublicTables(client), 1);
  });
});
