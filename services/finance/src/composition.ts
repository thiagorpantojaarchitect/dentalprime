/**
 * Composicao das dependencias de producao do finance.
 */

import { AuditService } from "./application/audit-service.js";
import {
  NoopEventPublisher,
  type EventPublisher,
} from "./application/event-publisher.js";
import { InvoiceService } from "./application/invoice-service.js";
import { PaymentPlanService } from "./application/payment-plan-service.js";
import { PaymentService } from "./application/payment-service.js";
import { PayoutService } from "./application/payout-service.js";
import { ReconciliationService } from "./application/reconciliation-service.js";
import type { Config } from "./config.js";
import { AuthorizationService } from "./domain/authorization.js";
import { createDbConnection, type DbConnection } from "./infrastructure/db/client.js";
import {
  DrizzleAuditRepository,
  DrizzleInvoiceRepository,
  DrizzlePaymentPlanRepository,
  DrizzlePaymentRepository,
  DrizzlePayoutRepository,
  DrizzleReconciliationRepository,
} from "./infrastructure/repositories.js";
import type { AppDeps } from "./app.js";

export interface Composition extends AppDeps {
  readonly connection: DbConnection;
}

export function composeProduction(
  config: Config,
  eventPublisher: EventPublisher = new NoopEventPublisher(),
): Composition {
  const connection = createDbConnection(config.databaseUrl);
  const db = connection.db;

  const invoiceRepo = new DrizzleInvoiceRepository(db);
  const paymentRepo = new DrizzlePaymentRepository(db);
  const planRepo = new DrizzlePaymentPlanRepository(db);
  const payoutRepo = new DrizzlePayoutRepository(db);
  const reconciliationRepo = new DrizzleReconciliationRepository(db);
  const auditRepo = new DrizzleAuditRepository(db);

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  const invoices = new InvoiceService({
    invoices: invoiceRepo,
    audit,
    events: eventPublisher,
    authorization,
  });
  const payments = new PaymentService({
    payments: paymentRepo,
    invoices: invoiceRepo,
    audit,
    events: eventPublisher,
    authorization,
  });
  const plans = new PaymentPlanService({
    plans: planRepo,
    invoices: invoiceRepo,
    audit,
    authorization,
  });
  const payouts = new PayoutService({
    payouts: payoutRepo,
    audit,
    authorization,
  });
  const reconciliation = new ReconciliationService({
    reconciliations: reconciliationRepo,
    audit,
    authorization,
  });

  return {
    connection,
    jwtSecret: config.jwtSecret,
    invoices,
    payments,
    plans,
    payouts,
    reconciliation,
  };
}
