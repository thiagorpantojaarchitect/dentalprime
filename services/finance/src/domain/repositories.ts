/**
 * Contratos de repositorio do finance. Todo metodo recebe `tenantId`
 * explicitamente; a implementacao aplica o filtro por tenant em toda consulta.
 */

import type { TenantId, UserId } from "@dentalprime/core";

import type { Cents } from "./money.js";
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
} from "./models.js";

export interface InvoiceRepository {
  findById(tenantId: TenantId, invoiceId: InvoiceId): Promise<Invoice | null>;
  create(input: {
    tenantId: TenantId;
    unitId: string;
    patientId: PatientId;
    currency: string;
    createdBy: UserId;
  }): Promise<Invoice>;
  updateTotals(
    tenantId: TenantId,
    invoiceId: InvoiceId,
    amountCents: Cents,
    balanceCents: Cents,
    status: InvoiceStatus,
  ): Promise<Invoice>;
  listItems(tenantId: TenantId, invoiceId: InvoiceId): Promise<InvoiceItem[]>;
  addItem(input: {
    tenantId: TenantId;
    invoiceId: InvoiceId;
    description: string;
    quantity: number;
    unitPriceCents: Cents;
    totalCents: Cents;
    sourceTreatmentItemId: string | null;
  }): Promise<InvoiceItem>;
  /** Item de fatura ja gerado a partir de um item de tratamento (idempotencia). */
  findItemBySource(
    tenantId: TenantId,
    sourceTreatmentItemId: string,
  ): Promise<InvoiceItem | null>;
}

export interface PaymentRepository {
  create(input: {
    tenantId: TenantId;
    invoiceId: InvoiceId;
    amountCents: Cents;
    method: PaymentMethod;
    externalRef: string | null;
    createdBy: UserId;
  }): Promise<Payment>;
  findByExternalRef(tenantId: TenantId, externalRef: string): Promise<Payment | null>;
  listForInvoice(tenantId: TenantId, invoiceId: InvoiceId): Promise<Payment[]>;
}

export interface PaymentPlanRepository {
  createPlan(input: {
    tenantId: TenantId;
    invoiceId: InvoiceId;
    installmentCount: number;
  }): Promise<{ id: string }>;
  addInstallment(input: {
    tenantId: TenantId;
    paymentPlanId: string;
    sequence: number;
    amountCents: Cents;
    dueDate: Date;
  }): Promise<Installment>;
  findInstallment(tenantId: TenantId, installmentId: string): Promise<Installment | null>;
  setInstallmentStatus(
    tenantId: TenantId,
    installmentId: string,
    status: InstallmentStatus,
    paidAt: Date | null,
  ): Promise<void>;
  /** Parcelas em aberto com vencimento anterior a `asOf`. */
  listOpenDueBefore(tenantId: TenantId, asOf: Date): Promise<Installment[]>;
}

export interface PayoutRepository {
  create(input: {
    tenantId: TenantId;
    providerId: ProviderId;
    invoiceItemId: string;
    baseCents: Cents;
    rateBasisPoints: number;
    amountCents: Cents;
  }): Promise<ProviderPayout>;
  listForProvider(tenantId: TenantId, providerId: ProviderId): Promise<ProviderPayout[]>;
}

export interface ReconciliationRepository {
  create(input: {
    tenantId: TenantId;
    reference: string;
    expectedCents: Cents;
    receivedCents: Cents;
    differenceCents: Cents;
    status: ReconciliationStatus;
  }): Promise<Reconciliation>;
}

export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>;
}
