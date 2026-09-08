/**
 * Implementacoes Drizzle dos repositorios do finance, com isolamento por tenant.
 * Cada consulta filtra por `tenantId`. Valores monetarios sao centavos inteiros.
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { and, eq, lt } from "drizzle-orm";

import type { Cents } from "../domain/money.js";
import type {
  AuditEntry,
  Installment,
  InstallmentStatus,
  Invoice,
  InvoiceId,
  InvoiceItem,
  InvoiceStatus,
  PatientId,
  Payment,
  PaymentMethod,
  ProviderId,
  ProviderPayout,
  Reconciliation,
  ReconciliationStatus,
} from "../domain/models.js";
import type {
  AuditRepository,
  InvoiceRepository,
  PaymentPlanRepository,
  PaymentRepository,
  PayoutRepository,
  ReconciliationRepository,
} from "../domain/repositories.js";
import type { Database } from "./db/client.js";
import {
  auditLogs,
  installments,
  invoiceItems,
  invoices,
  paymentPlans,
  payments,
  providerPayouts,
  reconciliations,
} from "./db/schema.js";

function toInvoice(row: typeof invoices.$inferSelect): Invoice {
  return {
    id: row.id,
    tenantId: row.tenantId,
    unitId: row.unitId,
    patientId: row.patientId,
    status: row.status,
    currency: row.currency,
    amountCents: row.amountCents,
    balanceCents: row.balanceCents,
  };
}

function toItem(row: typeof invoiceItems.$inferSelect): InvoiceItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    invoiceId: row.invoiceId,
    description: row.description,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    totalCents: row.totalCents,
    sourceTreatmentItemId: row.sourceTreatmentItemId,
  };
}

export class DrizzleInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, invoiceId: InvoiceId): Promise<Invoice | null> {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
      .limit(1);
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async create(input: {
    tenantId: TenantId;
    unitId: string;
    patientId: PatientId;
    currency: string;
    createdBy: UserId;
  }): Promise<Invoice> {
    const rows = await this.db.insert(invoices).values(input).returning();
    return toInvoice(rows[0]!);
  }

  async updateTotals(
    tenantId: TenantId,
    invoiceId: InvoiceId,
    amountCents: Cents,
    balanceCents: Cents,
    status: InvoiceStatus,
  ): Promise<Invoice> {
    const rows = await this.db
      .update(invoices)
      .set({ amountCents, balanceCents, status, updatedAt: new Date() })
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
      .returning();
    return toInvoice(rows[0]!);
  }

  async listItems(tenantId: TenantId, invoiceId: InvoiceId): Promise<InvoiceItem[]> {
    const rows = await this.db
      .select()
      .from(invoiceItems)
      .where(
        and(eq(invoiceItems.tenantId, tenantId), eq(invoiceItems.invoiceId, invoiceId)),
      );
    return rows.map(toItem);
  }

  async addItem(input: {
    tenantId: TenantId;
    invoiceId: InvoiceId;
    description: string;
    quantity: number;
    unitPriceCents: Cents;
    totalCents: Cents;
    sourceTreatmentItemId: string | null;
  }): Promise<InvoiceItem> {
    const rows = await this.db.insert(invoiceItems).values(input).returning();
    return toItem(rows[0]!);
  }

  async findItemBySource(
    tenantId: TenantId,
    sourceTreatmentItemId: string,
  ): Promise<InvoiceItem | null> {
    const rows = await this.db
      .select()
      .from(invoiceItems)
      .where(
        and(
          eq(invoiceItems.tenantId, tenantId),
          eq(invoiceItems.sourceTreatmentItemId, sourceTreatmentItemId),
        ),
      )
      .limit(1);
    return rows[0] ? toItem(rows[0]) : null;
  }
}

export class DrizzlePaymentRepository implements PaymentRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    invoiceId: InvoiceId;
    amountCents: Cents;
    method: PaymentMethod;
    externalRef: string | null;
    createdBy: UserId;
  }): Promise<Payment> {
    const rows = await this.db.insert(payments).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceId: row.invoiceId,
      amountCents: row.amountCents,
      method: row.method,
      externalRef: row.externalRef,
    };
  }

  async findByExternalRef(
    tenantId: TenantId,
    externalRef: string,
  ): Promise<Payment | null> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, tenantId), eq(payments.externalRef, externalRef)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceId: row.invoiceId,
      amountCents: row.amountCents,
      method: row.method,
      externalRef: row.externalRef,
    };
  }

  async listForInvoice(tenantId: TenantId, invoiceId: InvoiceId): Promise<Payment[]> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, tenantId), eq(payments.invoiceId, invoiceId)));
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      invoiceId: row.invoiceId,
      amountCents: row.amountCents,
      method: row.method,
      externalRef: row.externalRef,
    }));
  }
}

function toInstallment(row: typeof installments.$inferSelect): Installment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    paymentPlanId: row.paymentPlanId,
    sequence: row.sequence,
    amountCents: row.amountCents,
    dueDate: row.dueDate,
    status: row.status,
  };
}

export class DrizzlePaymentPlanRepository implements PaymentPlanRepository {
  constructor(private readonly db: Database) {}

  async createPlan(input: {
    tenantId: TenantId;
    invoiceId: InvoiceId;
    installmentCount: number;
  }): Promise<{ id: string }> {
    const rows = await this.db.insert(paymentPlans).values(input).returning();
    return { id: rows[0]!.id };
  }

  async addInstallment(input: {
    tenantId: TenantId;
    paymentPlanId: string;
    sequence: number;
    amountCents: Cents;
    dueDate: Date;
  }): Promise<Installment> {
    const rows = await this.db.insert(installments).values(input).returning();
    return toInstallment(rows[0]!);
  }

  async findInstallment(
    tenantId: TenantId,
    installmentId: string,
  ): Promise<Installment | null> {
    const rows = await this.db
      .select()
      .from(installments)
      .where(and(eq(installments.tenantId, tenantId), eq(installments.id, installmentId)))
      .limit(1);
    return rows[0] ? toInstallment(rows[0]) : null;
  }

  async setInstallmentStatus(
    tenantId: TenantId,
    installmentId: string,
    status: InstallmentStatus,
    paidAt: Date | null,
  ): Promise<void> {
    await this.db
      .update(installments)
      .set({ status, paidAt })
      .where(
        and(eq(installments.tenantId, tenantId), eq(installments.id, installmentId)),
      );
  }

  async listOpenDueBefore(tenantId: TenantId, asOf: Date): Promise<Installment[]> {
    const rows = await this.db
      .select()
      .from(installments)
      .where(
        and(
          eq(installments.tenantId, tenantId),
          eq(installments.status, "open"),
          lt(installments.dueDate, asOf),
        ),
      );
    return rows.map(toInstallment);
  }
}

export class DrizzlePayoutRepository implements PayoutRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    providerId: ProviderId;
    invoiceItemId: string;
    baseCents: Cents;
    rateBasisPoints: number;
    amountCents: Cents;
  }): Promise<ProviderPayout> {
    const rows = await this.db.insert(providerPayouts).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      providerId: row.providerId,
      invoiceItemId: row.invoiceItemId,
      baseCents: row.baseCents,
      rateBasisPoints: row.rateBasisPoints,
      amountCents: row.amountCents,
    };
  }

  async listForProvider(
    tenantId: TenantId,
    providerId: ProviderId,
  ): Promise<ProviderPayout[]> {
    const rows = await this.db
      .select()
      .from(providerPayouts)
      .where(
        and(
          eq(providerPayouts.tenantId, tenantId),
          eq(providerPayouts.providerId, providerId),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      providerId: row.providerId,
      invoiceItemId: row.invoiceItemId,
      baseCents: row.baseCents,
      rateBasisPoints: row.rateBasisPoints,
      amountCents: row.amountCents,
    }));
  }
}

export class DrizzleReconciliationRepository implements ReconciliationRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    reference: string;
    expectedCents: Cents;
    receivedCents: Cents;
    differenceCents: Cents;
    status: ReconciliationStatus;
  }): Promise<Reconciliation> {
    const rows = await this.db.insert(reconciliations).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      reference: row.reference,
      expectedCents: row.expectedCents,
      receivedCents: row.receivedCents,
      differenceCents: row.differenceCents,
      status: row.status,
    };
  }
}

export class DrizzleAuditRepository implements AuditRepository {
  constructor(private readonly db: Database) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLogs).values({
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      ipAddress: entry.ipAddress,
    });
  }
}
