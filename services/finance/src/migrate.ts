/**
 * Runner de migracoes do banco (idempotente).
 *
 * Aplica as migracoes SQL geradas pelo drizzle-kit (pasta ./drizzle) usando o
 * migrator do Drizzle, que mantem uma tabela de controle e so aplica o que
 * falta. Seguro para rodar em todo deploy. Le a connection string da config
 * (DATABASE_URL), sem hardcode. Encerra com codigo 0 em sucesso, 1 em falha.
 *
 * Uso: `node dist/migrate.js` (executado como tarefa de migracao antes de rotar
 * as tasks dos servicos).
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { loadConfig } from "./config.js";
import { createDbConnection } from "./infrastructure/db/client.js";

const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

async function runMigrations(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDbConnection(config.databaseUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Migracoes aplicadas com sucesso.");
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error: unknown) => {
  // Nao logamos a connection string nem segredos; apenas a mensagem do erro.
  console.error(
    "Falha ao aplicar migracoes:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
