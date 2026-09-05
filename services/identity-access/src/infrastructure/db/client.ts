/**
 * Cliente de banco (Drizzle + node-postgres).
 *
 * A string de conexao vem da configuracao (env local; Secrets Manager em
 * producao). Nunca hardcode credenciais.
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DbConnection {
  readonly db: Database;
  readonly pool: Pool;
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
