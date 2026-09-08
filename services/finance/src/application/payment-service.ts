/**
 * PaymentService: registro de pagamentos (total/parcial) e atualizacao de saldo.
 *
 * - Impede pagamento maior que o saldo devedor.
 * - Idempotente por `externalRef` (referencia do gateway): reenvio nao duplica.
 * - Atualiza status da fatura (partially_paid / paid) e publica PaymentReceived.
 *
 * Valores em centavos inteiros. Ver `.kiro/specs/finance/requirements.md`
 * (Requisito 2).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  NotFoundError,
  PaymentExceedsBalanceError,
  ValidationError,
} from "../domain/errors.js";
import type { Cents } from "../domain/money.js";
import type { Invoice, InvoiceId, Payment, PaymentMethod } from "../domain/models.js";
import type { InvoiceRepository, PaymentRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { paymentReceivedEvent, type EventPublisher } from "./event-publisher.js";

export interface RegisterPaymentInput {
  readonly invoiceId: InvoiceId;
  readonly amountCents: Cents;
  readonly method: PaymentMethod;
  readonly externalRef?: string | null;
}

export interface PaymentServiceDeps {
  readonly payments: PaymentRepository;
  readonly invoices: InvoiceRepository;
  readonly audit: AuditService;
  readonly events: EventPublisher;
  readonly authorization: AuthorizationService;
}

export interface PaymentResult {
  readonly payment: Payment;
  readonly invoice: Invoice;
  readonly idempotentReplay: boolean;
}

export class PaymentService {
  constructor(private readonly deps: PaymentServiceDeps) {}

  /** Registra um pagamento. Requer finance:manage. */
  async register(
    actor: TenantContext,
    input: RegisterPaymentInput,
  ): Promise<PaymentResult> {
    this.deps.authorization.ensure(actor, "finance:manage", actor.tenantId);

    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new ValidationError("Valor do pagamento invalido.");
    }

    const invoice = await this.deps.invoices.findById(actor.tenantId, input.invoiceId);
    if (!invoice) {
      throw new NotFoundError("Fatura nao encontrada.");
    }

    // Idempotencia por referencia externa do gateway.
    if (input.externalRef) {
      const existing = await this.deps.payments.findByExternalRef(
        actor.tenantId,
        input.externalRef,
      );
      if (existing) {
        const current = await this.deps.invoices.findById(
          actor.tenantId,
          input.invoiceId,
        );
        return { payment: existing, invoice: current!, idempotentReplay: true };
      }
    }

    if (input.amountCents > invoice.balanceCents) {
      throw new PaymentExceedsBalanceError();
    }

    const payment = await this.deps.payments.create({
      tenantId: actor.tenantId,
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      method: input.method,
      externalRef: input.externalRef ?? null,
      createdBy: actor.userId,
    });

    const newBalance = invoice.balanceCents - input.amountCents;
    const status = newBalance === 0 ? "paid" : "partially_paid";
    const updated = await this.deps.invoices.updateTotals(
      actor.tenantId,
      input.invoiceId,
      invoice.amountCents,
      newBalance,
      status,
    );

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "payment.received",
      resourceType: "payment",
      resourceId: payment.id,
    });

    await this.deps.events.publish(
      paymentReceivedEvent(actor.tenantId, {
        invoiceId: input.invoiceId,
        paymentId: payment.id,
        amountCents: input.amountCents,
        balanceCents: newBalance,
      }),
    );

    return { payment, invoice: updated, idempotentReplay: false };
  }
}
