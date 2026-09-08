/**
 * Schema Drizzle do dominio smart-scheduling.
 *
 * Toda tabela carrega `tenantId` (e a maioria tambem `unitId`) para isolamento
 * multi-tenant e por unidade. Horarios em UTC (timestamptz). Historico de status
 * e append-only.
 *
 * Ver `documentation/data-model.md` e `.kiro/specs/smart-scheduling/design.md`.
 */

import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Profissional agendavel (vinculado a um usuario do identity-access). */
export const providers = pgTable(
  "provider",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    userId: uuid("user_id").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("provider_tenant_unit_idx").on(table.tenantId, table.unitId)],
);

/** Recurso agendavel (cadeira, sala, equipamento). */
export const resources = pgTable(
  "resource",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("resource_tenant_unit_idx").on(table.tenantId, table.unitId)],
);

/**
 * Janela de disponibilidade de um provider (e opcionalmente um recurso). Um tipo
 * "available" define horario de atendimento; "block" define bloqueio (feriado,
 * folga). Sobreposicao entre disponibilidade e bloqueio e resolvida na aplicacao.
 */
export const availabilities = pgTable(
  "availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    providerId: uuid("provider_id").notNull(),
    resourceId: uuid("resource_id"),
    kind: text("kind", { enum: ["available", "block"] }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("availability_provider_idx").on(
      table.tenantId,
      table.providerId,
      table.startsAt,
    ),
  ],
);

/** Agendamento. Status atual denormalizado; historico em tabela propria. */
export const appointments = pgTable(
  "appointment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    providerId: uuid("provider_id").notNull(),
    resourceId: uuid("resource_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status", {
      enum: ["booked", "confirmed", "attended", "no_show", "cancelled"],
    })
      .notNull()
      .default("booked"),
    notes: text("notes"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("appointment_provider_time_idx").on(
      table.tenantId,
      table.providerId,
      table.startsAt,
    ),
    index("appointment_patient_idx").on(table.tenantId, table.patientId),
  ],
);

/** Historico de transicoes de status (append-only). */
export const appointmentStatusHistory = pgTable(
  "appointment_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedBy: uuid("changed_by").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("status_history_appointment_idx").on(table.tenantId, table.appointmentId),
  ],
);

/** Entrada na lista de espera para encaixe. */
export const waitlistEntries = pgTable(
  "waitlist_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    providerId: uuid("provider_id"),
    // Prioridade maior = atendida primeiro na sugestao de encaixe.
    priority: integer("priority").notNull().default(0),
    active: text("active", { enum: ["active", "fulfilled", "cancelled"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("waitlist_provider_idx").on(table.tenantId, table.providerId)],
);

/** Lembrete/confirmacao enviado e seu resultado. */
export const reminders = pgTable(
  "reminder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    channel: text("channel", { enum: ["sms", "email", "whatsapp", "push"] }).notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    result: text("result"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reminder_appointment_idx").on(table.tenantId, table.appointmentId)],
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
