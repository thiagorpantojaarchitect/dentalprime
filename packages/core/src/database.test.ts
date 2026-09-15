import { describe, expect, it } from "vitest";

import {
  assertPostgresIdentifier,
  databaseSchemaFor,
  migrationTableFor,
  postgresSearchPath,
  SERVICE_DATABASE_SCHEMAS,
} from "./database.js";

describe("service database isolation", () => {
  it("assigns a unique schema and migration journal to every backend service", () => {
    const services = Object.keys(SERVICE_DATABASE_SCHEMAS) as Array<
      keyof typeof SERVICE_DATABASE_SCHEMAS
    >;
    const schemas = services.map(databaseSchemaFor);
    const journals = services.map(migrationTableFor);

    expect(new Set(schemas).size).toBe(7);
    expect(new Set(journals).size).toBe(7);
    expect(
      schemas.every((schema) => postgresSearchPath(schema).endsWith(",public")),
    ).toBe(true);
  });

  it("rejects identifiers that could escape into SQL or connection options", () => {
    expect(() => assertPostgresIdentifier("valid_schema_1")).not.toThrow();
    expect(() => assertPostgresIdentifier("public; DROP SCHEMA public")).toThrow();
    expect(() => assertPostgresIdentifier("contains-dash")).toThrow();
    expect(() => assertPostgresIdentifier("")).toThrow();
  });
});
