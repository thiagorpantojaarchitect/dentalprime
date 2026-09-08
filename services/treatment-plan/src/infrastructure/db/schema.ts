/**
 * Schema Drizzle do dominio treatment-plan.
 *
 * Toda tabela carrega `tenantId`. Planos sao versionados por append (revisao
 * cria nova versao; a anterior e preservada). Valores monetarios usam `numeric`
 * (precisao fixa), nunca ponto flutuante, e trafegam como string no driver.
 *
 * Ver `documentation/data-model.md` e `.kiro/specs/treatment-plan/design.md`.
 */

import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Catalogo de procedimentos proprios da clinica. Codigos padronizados
 * licenciados (ex.: CDT/ADA) NAO sao aceitos sem acordo formal; a coluna
 * `licensedCode` existe para registro futuro, mas a aplicacao bloqueia seu uso.
 */
export const procedureCatalog = pgTable(
  "procedure_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    baseCost: numeric("base_cost", { precision: 12, scale: 2 }).notNull(),
    // Reservado para integracao licenciada futura; deve permanecer nulo por ora.
    licensedCode: text("licensed_code"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("procedure_tenant_name_idx").on(table.tenantId, table.name),
    index("procedure_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Plano de tratamento versionado. `planKey` e a identidade logica estavel entre
 * versoes; a maior `version` e a atual. Revisoes criam nova versao e marcam a
 * anterior como substituida (historico preservado).
 */
export const treatmentPlans = pgTable(
  "treatment_plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    planKey: uuid("plan_key").notNull(),
    version: integer("version").notNull().default(1),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["draft", "active", "completed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    authorUserId: uuid("author_user_id").notNull(),
    supersededByVersion: integer("superseded_by_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("plan_key_version_idx").on(table.tenantId, table.planKey, table.version),
    index("plan_patient_idx").on(table.tenantId, table.patientId),
  ],
);

/** Item de um plano de tratamento. Vinculado a uma versao especifica do plano. */
export const treatmentPlanItems = pgTable(
  "treatment_plan_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    planKey: uuid("plan_key").notNull(),
    planVersion: integer("plan_version").notNull(),
    procedureId: uuid("procedure_id").notNull(),
    // Custo estimado no momento do plano (pode diferir do custo base atual).
    estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }).notNull(),
    phase: integer("phase").notNull().default(1),
    orderInPhase: integer("order_in_phase").notNull().default(0),
    // Item do qual este depende (deve ser concluido antes), opcional.
    dependsOnItemId: uuid("depends_on_item_id"),
    status: text("status", {
      enum: ["proposed", "accepted", "in_progress", "completed", "cancelled"],
    })
      .notNull()
      .default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("item_plan_idx").on(table.tenantId, table.planKey, table.planVersion),
  ],
);

/** Registro (append-only) de decisoes de aceitacao de plano/item. */
export const planAcceptances = pgTable(
  "plan_acceptance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    planKey: uuid("plan_key").notNull(),
    // Nulo = decisao sobre o plano inteiro; preenchido = decisao sobre um item.
    itemId: uuid("item_id"),
    decision: text("decision", { enum: ["accepted", "declined", "deferred"] }).notNull(),
    decidedByUserId: uuid("decided_by_user_id").notNull(),
    note: text("note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("acceptance_plan_idx").on(table.tenantId, table.planKey)],
);

/** Trilha de auditoria append-only do dominio. */
export const auditLogs = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_tenant_idx").on(table.tenantId, table.createdAt)],
);
