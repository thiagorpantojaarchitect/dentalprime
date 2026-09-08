/**
 * Implementacoes em memoria dos repositorios, para testes. Respeitam o mesmo
 * contrato de isolamento por tenant e a idempotencia (por sourceTreatmentItemId
 * e por externalRef).
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { randomUUID } from "node:crypto";

import type { Cents } from "../domain/money.js";
import type {
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
  AuditEntry,
} from "../domain/models.js";
import type {
  AuditRepository,
  InvoiceRepository,
  PaymentPlanRepository,
  PaymentRepository,
  PayoutRepository,
  ReconciliationRepository,
} from "../domain/repositories.js";

export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly invoices = new Map<string, Invoice>();
  private readonly items = new Map<string, InvoiceItem>();

  async findById(tenantId: TenantId, invoiceId: InvoiceId): Promise<Invoice | null> {
    const inv = this.invoices.get(invoiceId);
    return inv && inv.tenantId === tenantId ? inv : null;
  }

  async create(input: {
    tenantId: TenantId;
    unitId: string;
    patientId: PatientId;
    currency: string;
    createdBy: UserId;
  }): Promise<Invoice> {
    const invoice: Invoice = {
      id: randomUUID(),
      tenantId: input.tenantId,
      unitId: input.unitId,
      patientId: input.patientId,
      status: "open",
      currency: input.currency,
      amountCents: 0,
      balanceCents: 0,
    };
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async updateTotals(
    tenantId: TenantId,
    invoiceId: InvoiceId,
    amountCents: Cents,
    balanceCents: Cents,
    status: InvoiceStatus,
  ): Promise<Invoice> {
    const current = await this.findById(tenantId, invoiceId);
    if (!current) throw new Error("invoice nao encontrada");
    const updated: Invoice = { ...current, amountCents, balanceCents, status };
    this.invoices.set(invoiceId, updated);
    return updated;
  }

  async listItems(tenantId: TenantId, invoiceId: InvoiceId): Promise<InvoiceItem[]> {
    return [...this.items.values()].filter(
      (i) => i.tenantId === tenantId && i.invoiceId === invoiceId,
    );
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
    const item: InvoiceItem = {
      id: randomUUID(),
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      description: input.description,
      quantity: input.quantity,
      unitPriceCents: input.unitPriceCents,
      totalCents: input.totalCents,
      sourceTreatmentItemId: input.sourceTreatmentItemId,
    };
    this.items.set(item.id, item);
    return item;
  }

  async findItemBySource(
    tenantId: TenantId,
    sourceTreatmentItemId: string,
  ): Promise<InvoiceItem | null> {
    for (const item of this.items.values()) {
      if (
        item.tenantId === tenantId &&
        item.sourceTreatmentItemId === sourceTreatmentItemId
      ) {
        return item;
      }
    }
    return null;
  }
}

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly rows = new Map<string, Payment>();

  async create(input: {
    tenantId: TenantId;
    invoiceId: InvoiceId;
    amountCents: Cents;
    method: PaymentMethod;
    externalRef: string | null;
    createdBy: UserId;
  }): Promise<Payment> {
    const payment: Payment = {
      id: randomUUID(),
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      method: input.method,
      externalRef: input.externalRef,
    };
    this.rows.set(payment.id, payment);
    return payment;
  }

  async findByExternalRef(
    tenantId: TenantId,
    externalRef: string,
  ): Promise<Payment | null> {
    for (const p of this.rows.values()) {
      if (p.tenantId === tenantId && p.externalRef === externalRef) return p;
    }
    return null;
  }

  async listForInvoice(tenantId: TenantId, invoiceId: InvoiceId): Promise<Payment[]> {
    return [...this.rows.values()].filter(
      (p) => p.tenantId === tenantId && p.invoiceId === invoiceId,
    );
  }
}

export class InMemoryPaymentPlanRepository implements PaymentPlanRepository {
  private readonly plans = new Map<string, { id: string; tenantId: TenantId }>();
  private readonly rows = new Map<string, Installment & { paidAt: Date | null }>();

  async createPlan(input: {
    tenantId: TenantId;
    invoiceId: InvoiceId;
    installmentCount: number;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    this.plans.set(id, { id, tenantId: input.tenantId });
    return { id };
  }

  async addInstallment(input: {
    tenantId: TenantId;
    paymentPlanId: string;
    sequence: number;
    amountCents: Cents;
    dueDate: Date;
  }): Promise<Installment> {
    const installment: Installment & { paidAt: Date | null } = {
      id: randomUUID(),
      tenantId: input.tenantId,
      paymentPlanId: input.paymentPlanId,
      sequence: input.sequence,
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      status: "open",
      paidAt: null,
    };
    this.rows.set(installment.id, installment);
    return installment;
  }

  async findInstallment(
    tenantId: TenantId,
    installmentId: string,
  ): Promise<Installment | null> {
    const i = this.rows.get(installmentId);
    return i && i.tenantId === tenantId ? i : null;
  }

  async setInstallmentStatus(
    tenantId: TenantId,
    installmentId: string,
    status: InstallmentStatus,
    paidAt: Date | null,
  ): Promise<void> {
    const i = this.rows.get(installmentId);
    if (i && i.tenantId === tenantId) {
      this.rows.set(installmentId, { ...i, status, paidAt });
    }
  }

  async listOpenDueBefore(tenantId: TenantId, asOf: Date): Promise<Installment[]> {
    return [...this.rows.values()].filter(
      (i) =>
        i.tenantId === tenantId &&
        i.status === "open" &&
        i.dueDate.getTime() < asOf.getTime(),
    );
  }
}

export class InMemoryPayoutRepository implements PayoutRepository {
  private readonly rows = new Map<string, ProviderPayout>();

  async create(input: {
    tenantId: TenantId;
    providerId: ProviderId;
    invoiceItemId: string;
    baseCents: Cents;
    rateBasisPoints: number;
    amountCents: Cents;
  }): Promise<ProviderPayout> {
    const payout: ProviderPayout = { id: randomUUID(), ...input };
    this.rows.set(payout.id, payout);
    return payout;
  }

  async listForProvider(
    tenantId: TenantId,
    providerId: ProviderId,
  ): Promise<ProviderPayout[]> {
    return [...this.rows.values()].filter(
      (p) => p.tenantId === tenantId && p.providerId === providerId,
    );
  }
}

export class InMemoryReconciliationRepository implements ReconciliationRepository {
  public readonly rows: Reconciliation[] = [];

  async create(input: {
    tenantId: TenantId;
    reference: string;
    expectedCents: Cents;
    receivedCents: Cents;
    differenceCents: Cents;
    status: ReconciliationStatus;
  }): Promise<Reconciliation> {
    const rec: Reconciliation = { id: randomUUID(), ...input };
    this.rows.push(rec);
    return rec;
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  public readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
