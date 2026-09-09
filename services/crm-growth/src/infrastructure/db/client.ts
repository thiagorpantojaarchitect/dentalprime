/**
 * Cliente de banco (Drizzle + node-postgres) do crm-growth.
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DbConnection {
  readonly db: Database;
  readonly pool: Pool;
}

export function createDbConnection(connectionString: string): DbConnection {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export { schema };
