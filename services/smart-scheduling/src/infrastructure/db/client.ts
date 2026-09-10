/**
 * Cliente de banco (Drizzle + node-postgres) do smart-scheduling.
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
// "pg" e um modulo CommonJS: sob ESM, importar via default e desestruturar.
import pg from "pg";

import * as schema from "./schema.js";

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

export interface DbConnection {
  readonly db: Database;
  readonly pool: pg.Pool;
}

export function createDbConnection(connectionString: string): DbConnection {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export { schema };
