/**
 * Schema Drizzle do dominio identity-access.
 *
 * Toda tabela de negocio carrega `tenantId` para isolamento multi-tenant.
 * Chaves primarias sao UUID. Campos de auditoria (createdAt/updatedAt) padrao.
 * `audit_log` e append-only (sem update/delete pela aplicacao).
 *
 * Ver `documentation/data-model.md` e `.kiro/specs/identity-access/design.md`.
 */

import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Tenant: clinica ou rede. Raiz do isolamento. */
export const tenants = pgTable("tenant", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Unidade fisica de um tenant (uma rede pode ter varias). */
export const clinicUnits = pgTable(
  "clinic_unit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("clinic_unit_tenant_idx").on(table.tenantId)],
);

/** Usuario do sistema. Email unico por tenant (nao globalmente). */
export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    // Hash de senha (argon2). Nunca a senha em claro.
    passwordHash: text("password_hash"),
    displayName: text("display_name").notNull(),
    // pending: convidado; active: ativo; disabled: desativado.
    status: text("status", { enum: ["pending", "active", "disabled"] })
      .notNull()
      .default("pending"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_tenant_email_idx").on(table.tenantId, table.email),
    index("user_tenant_idx").on(table.tenantId),
  ],
);

/** Atribuicao de papel a um usuario, escopada por tenant e (opcional) unidade. */
export const roleAssignments = pgTable(
  "role_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", {
      enum: [
        "owner",
        "manager",
        "dentist",
        "specialist",
        "assistant",
        "front-desk",
        "patient",
      ],
    }).notNull(),
    // Null = vale para todas as unidades do tenant.
    unitId: uuid("unit_id").references(() => clinicUnits.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("role_assignment_user_idx").on(table.tenantId, table.userId)],
);

/**
 * Sessao de autenticacao. Guarda apenas metadados e o hash do refresh token,
 * nunca o token em claro. `revokedAt` encerra a sessao.
 */
export const sessions = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("session_user_idx").on(table.tenantId, table.userId)],
);

/**
 * Trilha de auditoria append-only. A aplicacao apenas insere; nunca atualiza
 * ou remove. Nao deve conter segredos nem PII em claro alem do necessario.
 */
export const auditLogs = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    // Detalhes nao sensiveis (ex.: campos alterados, resultado allow/deny).
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_tenant_idx").on(table.tenantId, table.createdAt)],
);
