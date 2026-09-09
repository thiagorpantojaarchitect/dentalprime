/**
 * Schema Drizzle do dominio ai-front-desk.
 *
 * Toda tabela carrega `tenantId`. Mensagens de IA sao marcadas (`isAI`). Acoes
 * sugeridas pela IA que possam influenciar cuidado ficam em `ai_action_log` com
 * status pendente de revisao humana — nunca aplicadas automaticamente.
 *
 * Ver `documentation/data-model.md`, `.kiro/steering/clinical-safety.md`.
 */

import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Conversa de atendimento (recepcao por IA). */
export const conversations = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    // Referencia ao contato: lead id, paciente id, telefone/email normalizado.
    contactRef: text("contact_ref"),
    channel: text("channel", { enum: ["chat", "whatsapp", "voice", "web"] }).notNull(),
    status: text("status", { enum: ["open", "handoff", "closed"] })
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("conversation_tenant_status_idx").on(table.tenantId, table.status)],
);

/** Mensagem de uma conversa. `isAI=true` marca conteudo gerado por IA. */
export const messages = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    role: text("role", { enum: ["contact", "ai", "human_agent"] }).notNull(),
    isAI: boolean("is_ai").notNull().default(false),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("message_conversation_idx").on(table.tenantId, table.conversationId)],
);

/** Transferencia de atendimento para humano. */
export const handoffs = pgTable(
  "handoff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    reason: text("reason").notNull(),
    // Origem do handoff: solicitado pelo contato, pela IA (guardrail) ou regra.
    triggeredBy: text("triggered_by", { enum: ["contact", "ai", "rule"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("handoff_conversation_idx").on(table.tenantId, table.conversationId)],
);

/**
 * Registro de acoes sugeridas/executadas pela IA. Acoes que possam influenciar
 * cuidado nascem com `reviewStatus = pending` e NAO sao aplicadas ate revisao
 * humana. Ex.: sugestao de agendamento.
 */
export const aiActionLogs = pgTable(
  "ai_action_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    actionType: text("action_type").notNull(),
    payload: jsonb("payload"),
    reviewStatus: text("review_status", {
      enum: ["pending", "approved", "rejected", "not_required"],
    })
      .notNull()
      .default("pending"),
    reviewedByUserId: uuid("reviewed_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ai_action_conversation_idx").on(table.tenantId, table.conversationId),
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
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_tenant_idx").on(table.tenantId, table.createdAt)],
);
