/**
 * InvoiceService: criacao e faturamento.
 *
 * - Cria faturas e adiciona itens; recalcula total e saldo.
 * - Consome TreatmentItemAccepted (do treatment-plan) para gerar item de fatura,
 *   de forma idempotente (nao duplica se o mesmo item de tratamento chegar de
 *   novo).
 * - Publica InvoiceIssued ao emitir uma fatura com itens.
 *
 * Valores em centavos inteiros. Ver `.kiro/specs/finance/requirements.md`
 * (Requisito 1).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import { decimalToCents, sumCents, type Cents } from "../domain/money.js";
import type {
  Invoice,
  InvoiceId,
  InvoiceItem,
  InvoiceStatus,
  PatientId,
} from "../domain/models.js";
import type { InvoiceRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { invoiceIssuedEvent, type EventPublisher } from "./event-publisher.js";

export interface AddItemInput {
  readonly description: string;
  readonly quantity?: number | undefined;
  readonly unitPriceCents: Cents;
}

export interface TreatmentItemAcceptedInput {
  readonly tenantId: string;
  readonly patientId: PatientId;
  readonly unitId: string;
  readonly sourceTreatmentItemId: string;
  readonly description: string;
  readonly estimatedCost: string;
  readonly systemUserId: string;
}

export interface InvoiceServiceDeps {
  readonly invoices: InvoiceRepository;
  readonly audit: AuditService;
  readonly events: EventPublisher;
  readonly authorization: AuthorizationService;
}

export class InvoiceService {
  constructor(private readonly deps: InvoiceServiceDeps) {}

  /** Cria uma fatura vazia (status open). Requer finance:manage. */
  async createInvoice(
    actor: TenantContext,
    patientId: PatientId,
    unitId: string,
    currency = "BRL",
  ): Promise<Invoice> {
    this.deps.authorization.ensure(actor, "finance:manage", actor.tenantId);
    const invoice = await this.deps.invoices.create({
      tenantId: actor.tenantId,
      unitId,
      patientId,
      currency,
      createdBy: actor.userId,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "invoice.created",
      resourceType: "invoice",
      resourceId: invoice.id,
    });
    return invoice;
  }

  /** Adiciona um item e recalcula os totais. Requer finance:manage. */
  async addItem(
    actor: TenantContext,
    invoiceId: InvoiceId,
    input: AddItemInput,
  ): Promise<InvoiceItem> {
    this.deps.authorization.ensure(actor, "finance:manage", actor.tenantId);

    const invoice = await this.deps.invoices.findById(actor.tenantId, invoiceId);
    if (!invoice) {
      throw new NotFoundError("Fatura nao encontrada.");
    }
    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError("Quantidade invalida.");
    }
    if (!Number.isInteger(input.unitPriceCents) || input.unitPriceCents < 0) {
      throw new ValidationError("Preco unitario invalido.");
    }

    const totalCents = input.unitPriceCents * quantity;
    const item = await this.deps.invoices.addItem({
      tenantId: actor.tenantId,
      invoiceId,
      description: input.description,
      quantity,
      unitPriceCents: input.unitPriceCents,
      totalCents,
      sourceTreatmentItemId: null,
    });

    await this.recomputeTotals(actor.tenantId, invoiceId);
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "invoice.item_added",
      resourceType: "invoice_item",
      resourceId: item.id,
    });
    return item;
  }

  /**
   * Consome um evento TreatmentItemAccepted e gera o item de fatura
   * correspondente, de forma idempotente. Se ja existir item com o mesmo
   * sourceTreatmentItemId, nao faz nada. Cria uma fatura aberta se necessario.
   *
   * Executado por um consumidor de eventos (sem contexto de usuario humano); o
   * ator e o "sistema".
   */
  async handleTreatmentItemAccepted(
    input: TreatmentItemAcceptedInput,
  ): Promise<InvoiceItem | null> {
    const existing = await this.deps.invoices.findItemBySource(
      input.tenantId,
      input.sourceTreatmentItemId,
    );
    if (existing) {
      return null; // idempotente: ja processado
    }

    const invoice = await this.deps.invoices.create({
      tenantId: input.tenantId,
      unitId: input.unitId,
      patientId: input.patientId,
      currency: "BRL",
      createdBy: input.systemUserId,
    });

    const unitPriceCents = decimalToCents(input.estimatedCost);
    const item = await this.deps.invoices.addItem({
      tenantId: input.tenantId,
      invoiceId: invoice.id,
      description: input.description,
      quantity: 1,
      unitPriceCents,
      totalCents: unitPriceCents,
      sourceTreatmentItemId: input.sourceTreatmentItemId,
    });

    const updated = await this.recomputeTotals(input.tenantId, invoice.id);

    await this.deps.audit.record({
      tenantId: input.tenantId,
      actorUserId: null,
      action: "invoice.generated_from_treatment",
      resourceType: "invoice",
      resourceId: invoice.id,
    });

    await this.deps.events.publish(
      invoiceIssuedEvent(input.tenantId, {
        invoiceId: invoice.id,
        patientId: input.patientId,
        amountCents: updated.amountCents,
      }),
    );

    return item;
  }

  /** Recalcula total e saldo da fatura a partir dos itens e status atual. */
  private async recomputeTotals(
    tenantId: string,
    invoiceId: InvoiceId,
  ): Promise<Invoice> {
    const invoice = await this.deps.invoices.findById(tenantId, invoiceId);
    if (!invoice) {
      throw new NotFoundError("Fatura nao encontrada.");
    }
    const items = await this.deps.invoices.listItems(tenantId, invoiceId);
    const amountCents = sumCents(items.map((i) => i.totalCents));
    // Preserva o quanto ja foi pago: saldo = total - (total anterior - saldo anterior).
    const paidCents = invoice.amountCents - invoice.balanceCents;
    const balanceCents = Math.max(0, amountCents - paidCents);
    const status = this.deriveStatus(invoice.status, amountCents, balanceCents);
    return this.deps.invoices.updateTotals(
      tenantId,
      invoiceId,
      amountCents,
      balanceCents,
      status,
    );
  }

  private deriveStatus(
    current: InvoiceStatus,
    amountCents: Cents,
    balanceCents: Cents,
  ): InvoiceStatus {
    if (current === "cancelled") return "cancelled";
    if (amountCents === 0) return "open";
    if (balanceCents === 0) return "paid";
    if (balanceCents < amountCents) return "partially_paid";
    return "open";
  }
}
