import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  InMemoryAuditRepository,
  InMemoryInvoiceRepository,
  InMemoryPaymentPlanRepository,
  InMemoryPaymentRepository,
  InMemoryPayoutRepository,
  InMemoryReconciliationRepository,
} from "../infrastructure/memory-repositories.js";
import { AuditService } from "./audit-service.js";
import { InMemoryEventPublisher } from "./event-publisher.js";
import { InvoiceService } from "./invoice-service.js";
import { PaymentPlanService } from "./payment-plan-service.js";
import { PaymentService } from "./payment-service.js";
import { PayoutService } from "./payout-service.js";
import { ReconciliationService } from "./reconciliation-service.js";

export const TENANT_A = "11111111-1111-1111-1111-111111111111";
export const TENANT_B = "22222222-2222-2222-2222-222222222222";
export const UNIT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const PATIENT_A = "99999999-9999-9999-9999-999999999999";

export function makeContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: TENANT_A,
    userId: "user-1",
    roles: ["manager"],
    units: [],
    ...overrides,
  };
}

export function buildEnv() {
  const invoiceRepo = new InMemoryInvoiceRepository();
  const paymentRepo = new InMemoryPaymentRepository();
  const planRepo = new InMemoryPaymentPlanRepository();
  const payoutRepo = new InMemoryPayoutRepository();
  const reconciliationRepo = new InMemoryReconciliationRepository();
  const auditRepo = new InMemoryAuditRepository();
  const events = new InMemoryEventPublisher();

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  return {
    auditRepo,
    events,
    invoices: new InvoiceService({ invoices: invoiceRepo, audit, events, authorization }),
    payments: new PaymentService({
      payments: paymentRepo,
      invoices: invoiceRepo,
      audit,
      events,
      authorization,
    }),
    plans: new PaymentPlanService({
      plans: planRepo,
      invoices: invoiceRepo,
      audit,
      authorization,
    }),
    payouts: new PayoutService({ payouts: payoutRepo, audit, authorization }),
    reconciliation: new ReconciliationService({
      reconciliations: reconciliationRepo,
      audit,
      authorization,
    }),
  };
}
