/**
 * Schema Drizzle do dominio crm-growth.
 *
 * Toda tabela carrega `tenantId`. A comunicacao respeita consentimento/opt-out
 * (`contact_consent`): a decisao mais recente por (contato, finalidade, canal)
 * determina a elegibilidade. Historico de status de lead e append-only.
 *
 * Ver `documentation/data-model.md` e `.kiro/specs/crm-growth/design.md`.
 */

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Lead/prospect. `patientId` preenchido quando convertido. */
export const leads = pgTable(
  "lead",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    source: text("source"),
    status: text("status", {
      enum: ["new", "contacted", "qualified", "converted", "lost"],
    })
      .notNull()
      .default("new"),
    patientId: uuid("patient_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lead_tenant_status_idx").on(table.tenantId, table.status)],
);

/** Interacao registrada com um lead ou paciente. */
export const interactions = pgTable(
  "interaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    // Alvo da interacao: lead ou paciente (um dos dois).
    leadId: uuid("lead_id"),
    patientId: uuid("patient_id"),
    kind: text("kind").notNull(),
    channel: text("channel", {
      enum: ["phone", "email", "whatsapp", "in_person"],
    }).notNull(),
    note: text("note"),
    authorUserId: uuid("author_user_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("interaction_lead_idx").on(table.tenantId, table.leadId),
    index("interaction_patient_idx").on(table.tenantId, table.patientId),
  ],
);

/** Campanha de captacao/reativacao. */
export const campaigns = pgTable(
  "campaign",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    channel: text("channel", {
      enum: ["phone", "email", "whatsapp", "in_person"],
    }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("campaign_tenant_idx").on(table.tenantId)],
);

/** Segmento definido por criterios (JSON). */
export const segments = pgTable(
  "segment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    criteria: jsonb("criteria").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("segment_tenant_idx").on(table.tenantId)],
);

/**
 * Consentimento de contato por finalidade e canal (append-only). O registro
 * mais recente por (contactRef, purpose, channel) determina a elegibilidade.
 * `contactRef` identifica o contato (lead id, paciente id ou e-mail/telefone
 * normalizado).
 */
export const contactConsents = pgTable(
  "contact_consent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    contactRef: text("contact_ref").notNull(),
    purpose: text("purpose").notNull(),
    channel: text("channel", {
      enum: ["phone", "email", "whatsapp", "in_person"],
    }).notNull(),
    decision: text("decision", { enum: ["opt_in", "opt_out"] }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("consent_contact_idx").on(
      table.tenantId,
      table.contactRef,
      table.purpose,
      table.channel,
    ),
  ],
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
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_tenant_idx").on(table.tenantId, table.createdAt)],
);
