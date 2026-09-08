/**
 * PaymentPlanService: parcelamento de uma fatura.
 *
 * - Cria um plano com N parcelas iguais (distribuindo o resto em centavos para
 *   somar exatamente o total), com datas de vencimento mensais.
 * - Marca parcelas vencidas (open com dueDate no passado) como "overdue".
 *
 * Ver `.kiro/specs/finance/requirements.md` (Requisito 3).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import { splitCents } from "../domain/money.js";
import type { Installment, InvoiceId } from "../domain/models.js";
import type { InvoiceRepository, PaymentPlanRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface CreatePlanInput {
  readonly invoiceId: InvoiceId;
  readonly installmentCount: number;
  /** Data de vencimento da primeira parcela. */
  readonly firstDueDate: Date;
}

export interface PaymentPlanServiceDeps {
  readonly plans: PaymentPlanRepository;
  readonly invoices: InvoiceRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

/** Adiciona `months` meses a uma data (dia do mes preservado quando possivel). */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

export class PaymentPlanService {
  constructor(private readonly deps: PaymentPlanServiceDeps) {}

  /**
   * Cria um parcelamento do saldo devedor da fatura em N parcelas mensais.
   * Requer finance:manage.
   */
  async createPlan(actor: TenantContext, input: CreatePlanInput): Promise<Installment[]> {
    this.deps.authorization.ensure(actor, "finance:manage", actor.tenantId);

    if (!Number.isInteger(input.installmentCount) || input.installmentCount <= 0) {
      throw new ValidationError("Numero de parcelas invalido.");
    }

    const invoice = await this.deps.invoices.findById(actor.tenantId, input.invoiceId);
    if (!invoice) {
      throw new NotFoundError("Fatura nao encontrada.");
    }
    if (invoice.balanceCents <= 0) {
      throw new ValidationError("Fatura sem saldo devedor a parcelar.");
    }

    const plan = await this.deps.plans.createPlan({
      tenantId: actor.tenantId,
      invoiceId: input.invoiceId,
      installmentCount: input.installmentCount,
    });

    const amounts = splitCents(invoice.balanceCents, input.installmentCount);
    const created: Installment[] = [];
    for (let i = 0; i < amounts.length; i++) {
      const installment = await this.deps.plans.addInstallment({
        tenantId: actor.tenantId,
        paymentPlanId: plan.id,
        sequence: i + 1,
        amountCents: amounts[i]!,
        dueDate: addMonths(input.firstDueDate, i),
      });
      created.push(installment);
    }

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "payment_plan.created",
      resourceType: "payment_plan",
      resourceId: plan.id,
    });

    return created;
  }

  /** Marca uma parcela como paga. Requer finance:manage. */
  async markInstallmentPaid(actor: TenantContext, installmentId: string): Promise<void> {
    this.deps.authorization.ensure(actor, "finance:manage", actor.tenantId);
    const installment = await this.deps.plans.findInstallment(
      actor.tenantId,
      installmentId,
    );
    if (!installment) {
      throw new NotFoundError("Parcela nao encontrada.");
    }
    await this.deps.plans.setInstallmentStatus(
      actor.tenantId,
      installmentId,
      "paid",
      new Date(),
    );
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "installment.paid",
      resourceType: "installment",
      resourceId: installmentId,
    });
  }

  /**
   * Marca como "overdue" as parcelas em aberto vencidas ate `asOf`. Retorna a
   * quantidade marcada. Idempotente (parcelas ja overdue nao sao reprocessadas).
   * Normalmente disparado por um job agendado.
   */
  async markOverdue(tenantId: string, asOf: Date = new Date()): Promise<number> {
    const due = await this.deps.plans.listOpenDueBefore(tenantId, asOf);
    for (const installment of due) {
      await this.deps.plans.setInstallmentStatus(
        tenantId,
        installment.id,
        "overdue",
        null,
      );
    }
    return due.length;
  }
}
