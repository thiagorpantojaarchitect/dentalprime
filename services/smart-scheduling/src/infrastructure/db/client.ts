/**
 * Cliente de banco (Drizzle + node-postgres) do smart-scheduling.
 */

import {
  databaseSchemaFor,
  migrationTableFor,
  postgresSearchPath,
} from "@dentalprime/core";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
// "pg" e um modulo CommonJS: sob ESM, importar via default e desestruturar.
import pg from "pg";

import * as schema from "./schema.js";

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

export interface DbConnection {
  readonly db: Database;
  readonly pool: pg.Pool;
  readonly checkReady: () => Promise<void>;
}

export const DATABASE_SCHEMA = databaseSchemaFor("smart-scheduling");
export const MIGRATIONS_TABLE = migrationTableFor("smart-scheduling");

export function createDbConnection(connectionString: string): DbConnection {
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${postgresSearchPath(DATABASE_SCHEMA)}`,
  });
  const db = drizzle(pool, { schema });
  const checkReady = async (): Promise<void> => {
    const result = await pool.query<{ auditLog: string | null }>(
      'SELECT to_regclass($1)::text AS "auditLog"',
      [`${DATABASE_SCHEMA}.audit_log`],
    );
    if (!result.rows[0]?.auditLog) throw new Error("Database schema is not ready.");
  };
  return { db, pool, checkReady };
}

export { schema };
