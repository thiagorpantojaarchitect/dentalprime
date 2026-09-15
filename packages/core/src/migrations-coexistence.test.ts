import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { databaseSchemaFor, SERVICE_DATABASE_SCHEMAS } from "./database.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const MIGRATIONS: Readonly<Record<keyof typeof SERVICE_DATABASE_SCHEMAS, string>> = {
  "identity-access": "0000_luxuriant_punisher.sql",
  "patient-record": "0000_dashing_doctor_strange.sql",
  "smart-scheduling": "0000_tan_alex_wilder.sql",
  "treatment-plan": "0000_omniscient_chameleon.sql",
  finance: "0000_deep_charles_xavier.sql",
  "crm-growth": "0000_vengeful_vulcan.sql",
  "ai-front-desk": "0000_quick_thundra.sql",
};

describe("backend migration coexistence harness", () => {
  it("namespaces every migration so all seven audit logs can coexist", () => {
    const qualifiedTables = new Set<string>();
    const qualifiedAuditLogs: string[] = [];

    for (const [service, baseMigration] of Object.entries(MIGRATIONS) as Array<
      [keyof typeof MIGRATIONS, string]
    >) {
      const schema = databaseSchemaFor(service);
      const migrationDirectory = resolve(PROJECT_ROOT, "services", service, "drizzle");
      const migratorSource = readFileSync(
        resolve(PROJECT_ROOT, "services", service, "src", "migrate.ts"),
        "utf8",
      );
      const clientSource = readFileSync(
        resolve(
          PROJECT_ROOT,
          "services",
          service,
          "src",
          "infrastructure",
          "db",
          "client.ts",
        ),
        "utf8",
      );
      expect(migratorSource).toContain("migrationsSchema: DATABASE_SCHEMA");
      expect(migratorSource).toContain("migrationsTable: MIGRATIONS_TABLE");
      expect(clientSource).toContain("postgresSearchPath(DATABASE_SCHEMA)");

      const baseSql = readFileSync(resolve(migrationDirectory, baseMigration), "utf8");

      expect(baseSql).toContain(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

      const migrationFiles = readdirSync(migrationDirectory)
        .filter((fileName) => fileName.endsWith(".sql"))
        .sort();
      expect(migrationFiles.length).toBeGreaterThan(0);

      for (const fileName of migrationFiles) {
        const sql = readFileSync(resolve(migrationDirectory, fileName), "utf8");

        expect(sql).toContain(`SET search_path TO "${schema}", public`);
        expect(sql).not.toMatch(/REFERENCES\s+"public"\./u);

        for (const match of sql.matchAll(/CREATE TABLE "([a-z0-9_]+)"/gu)) {
          const qualified = `${schema}.${match[1]}`;
          expect(qualifiedTables.has(qualified)).toBe(false);
          qualifiedTables.add(qualified);
          if (match[1] === "audit_log") qualifiedAuditLogs.push(qualified);
        }
      }
    }

    expect(qualifiedAuditLogs).toHaveLength(7);
    expect(new Set(qualifiedAuditLogs).size).toBe(7);
  });
});
