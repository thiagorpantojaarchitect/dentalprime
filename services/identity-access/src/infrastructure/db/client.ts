/**
 * Cliente de banco (Drizzle + node-postgres).
 *
 * A string de conexao vem da configuracao (env local; Secrets Manager em
 * producao). Nunca hardcode credenciais.
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
// "pg" e um modulo CommonJS: sob ESM, importar via default e desestruturar.
// O import nomeado (`import { Pool } from "pg"`) quebra em runtime.
import pg from "pg";

import * as schema from "./schema.js";

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

export interface DbConnection {
  readonly db: Database;
  readonly pool: pg.Pool;
}

/**
 * Cria a conexao com o banco a partir de uma connection string.
 */
export function createDbConnection(connectionString: string): DbConnection {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export { schema };
