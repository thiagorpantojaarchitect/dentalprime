/**
 * Logical PostgreSQL isolation for the services that share the Aurora cluster.
 *
 * A service owns one schema and one Drizzle migration journal. Identifiers are
 * constants, but every exported helper still validates them before they can be
 * interpolated into connection options or DDL.
 */

export const SERVICE_DATABASE_SCHEMAS = {
  "identity-access": "identity_access",
  "patient-record": "patient_record",
  "smart-scheduling": "smart_scheduling",
  "treatment-plan": "treatment_plan",
  finance: "finance",
  "crm-growth": "crm_growth",
  "ai-front-desk": "ai_front_desk",
} as const;

export type ServiceName = keyof typeof SERVICE_DATABASE_SCHEMAS;

const POSTGRES_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

export function assertPostgresIdentifier(value: string): string {
  if (!POSTGRES_IDENTIFIER.test(value)) {
    throw new Error("Invalid PostgreSQL identifier.");
  }
  return value;
}

export function databaseSchemaFor(service: ServiceName): string {
  return assertPostgresIdentifier(SERVICE_DATABASE_SCHEMAS[service]);
}

export function migrationTableFor(service: ServiceName): string {
  return assertPostgresIdentifier(`__drizzle_migrations_${databaseSchemaFor(service)}`);
}

export function postgresSearchPath(schema: string): string {
  return `${assertPostgresIdentifier(schema)},public`;
}

export function quotePostgresIdentifier(identifier: string): string {
  return `"${assertPostgresIdentifier(identifier)}"`;
}
