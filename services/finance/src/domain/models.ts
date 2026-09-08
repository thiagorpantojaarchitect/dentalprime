/**
 * Modelos de dominio do finance. Valores monetarios em centavos inteiros.
 */

import type { TenantId, UserId } from "@dentalprime/core";

import type { Cents } from "./money.js";

export type InvoiceId = string;
export type PatientId = string;
export type ProviderId = string;

export type InvoiceStatus = "open" | "partially_paid" | "paid" | "cancelled";
export type PaymentMethod = "cash" | "card" | "pix" | "boleto" | "transfer";
export type InstallmentStatus = "open" | "paid" | "overdue";
export type ReconciliationStatus = "matched" | "divergent";

export interface Invoice {
  readonly id: InvoiceId;
  readonly tenantId: TenantId;
  readonly unitId: string;
  readonly patientId: PatientId;
  readonly status: InvoiceStatus;
  readonly currency: string;
  readonly amountCents: Cents;
  readonly balanceCents: Cents;
}

export interface InvoiceItem {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly invoiceId: InvoiceId;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceCents: Cents;
  readonly totalCents: Cents;
  readonly sourceTreatmentItemId: string | null;
}

export interface Payment {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly invoiceId: InvoiceId;
  readonly amountCents: Cents;
  readonly method: PaymentMethod;
  readonly externalRef: string | null;
}

export interface Installment {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly paymentPlanId: string;
  readonly sequence: number;
  readonly amountCents: Cents;
  readonly dueDate: Date;
  readonly status: InstallmentStatus;
}

export interface ProviderPayout {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly providerId: ProviderId;
  readonly invoiceItemId: string;
  readonly baseCents: Cents;
  readonly rateBasisPoints: number;
  readonly amountCents: Cents;
}

export interface Reconciliation {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly reference: string;
  readonly expectedCents: Cents;
  readonly receivedCents: Cents;
  readonly differenceCents: Cents;
  readonly status: ReconciliationStatus;
}

export interface AuditEntry {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly ipAddress: string | null;
}

/**
 * Calcula o repasse a partir de uma base e uma taxa em pontos-base (inteiro).
 * Ex.: base 80000 centavos, taxa 5000 (50%) => 40000 centavos. Arredonda para
 * baixo (centavo inteiro), sem ponto flutuante binario impreciso.
 */
export function computePayoutCents(baseCents: Cents, rateBasisPoints: number): Cents {
  if (!Number.isInteger(baseCents) || !Number.isInteger(rateBasisPoints)) {
    throw new Error("Base e taxa devem ser inteiros.");
  }
  return Math.floor((baseCents * rateBasisPoints) / 10000);
}
