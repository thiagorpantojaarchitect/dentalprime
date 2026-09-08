/**
 * Schema Drizzle do dominio finance.
 *
 * Toda tabela carrega `tenantId`. Valores monetarios sao armazenados como
 * `bigint` de CENTAVOS inteiros (precisao fixa), com `mode: "number"` no driver.
 * Dados fiscais brasileiros ficam estruturados em jsonb, rastreaveis, sem
 * emissao via integracao licenciada (bloqueada por ora).
 *
 * Ver `documentation/data-model.md` e `.kiro/specs/finance/design.md`.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Fatura ao paciente. `amountCents` e o total; `balanceCents` o saldo devedor. */
export const invoices = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    status: text("status", {
      enum: ["open", "partially_paid", "paid", "cancelled"],
    })
      .notNull()
      .default("open"),
    currency: text("currency").notNull().default("BRL"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
    // Dados fiscais estruturados (tomador, natureza do servico, tributos...).
    fiscalData: jsonb("fiscal_data"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invoice_tenant_patient_idx").on(table.tenantId, table.patientId),
    index("invoice_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

/** Item de fatura. Pode referenciar um item de plano de tratamento (origem). */
export const invoiceItems = pgTable(
  "invoice_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    // Origem: item de plano de tratamento que gerou este item (idempotencia).
    sourceTreatmentItemId: uuid("source_treatment_item_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invoice_item_invoice_idx").on(table.tenantId, table.invoiceId),
    // Garante idempotencia: um item de tratamento gera no maximo um item de fatura.
    uniqueIndex("invoice_item_source_idx")
      .on(table.tenantId, table.sourceTreatmentItemId)
      .where(sql`source_treatment_item_id IS NOT NULL`),
  ],
);

/** Pagamento recebido. `externalRef` da idempotencia por gateway. */
export const payments = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    method: text("method", {
      enum: ["cash", "card", "pix", "boleto", "transfer"],
    }).notNull(),
    // Referencia externa do gateway; unica por tenant para idempotencia.
    externalRef: text("external_ref"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").notNull(),
  },
  (table) => [
    index("payment_invoice_idx").on(table.tenantId, table.invoiceId),
    uniqueIndex("payment_external_ref_idx")
      .on(table.tenantId, table.externalRef)
      .where(sql`external_ref IS NOT NULL`),
  ],
);

/** Plano de pagamento (parcelamento) de uma fatura. */
export const paymentPlans = pgTable(
  "payment_plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    installmentCount: integer("installment_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payment_plan_invoice_idx").on(table.tenantId, table.invoiceId)],
);

/** Parcela de um plano de pagamento. */
export const installments = pgTable(
  "installment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    paymentPlanId: uuid("payment_plan_id").notNull(),
    sequence: integer("sequence").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["open", "paid", "overdue"] })
      .notNull()
      .default("open"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    index("installment_plan_idx").on(table.tenantId, table.paymentPlanId),
    index("installment_due_idx").on(table.tenantId, table.status, table.dueDate),
  ],
);

/** Repasse a profissional, calculado por regra. */
export const providerPayouts = pgTable(
  "provider_payout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    providerId: uuid("provider_id").notNull(),
    invoiceItemId: uuid("invoice_item_id").notNull(),
    baseCents: bigint("base_cents", { mode: "number" }).notNull(),
    // Percentual em pontos-base (ex.: 5000 = 50,00%). Inteiro, sem float.
    rateBasisPoints: integer("rate_basis_points").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payout_provider_idx").on(table.tenantId, table.providerId)],
);

/** Registro de conciliacao entre pagamentos e recebimentos. */
export const reconciliations = pgTable(
  "reconciliation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    reference: text("reference").notNull(),
    expectedCents: bigint("expected_cents", { mode: "number" }).notNull(),
    receivedCents: bigint("received_cents", { mode: "number" }).notNull(),
    // Diferenca (recebido - esperado); zero = conciliado.
    differenceCents: bigint("difference_cents", { mode: "number" }).notNull(),
    status: text("status", { enum: ["matched", "divergent"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reconciliation_tenant_idx").on(table.tenantId, table.status)],
);

/**
 * Solicitacao a convenio. Desabilitada por padrao: integracao com
 * clearinghouses/convenios exige parceria/acordo formal (ver PRD).
 */
export const insuranceClaims = pgTable(
  "insurance_claim",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    status: text("status").notNull().default("disabled"),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("claim_invoice_idx").on(table.tenantId, table.invoiceId)],
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
