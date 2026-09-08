/**
 * PayoutService: calculo de repasses a profissionais.
 *
 * O repasse e calculado sobre uma base (geralmente o valor de um item de fatura)
 * aplicando uma taxa em pontos-base (inteiro; 5000 = 50,00%). Registra base,
 * taxa e valor, tudo auditavel.
 *
 * Ver `.kiro/specs/finance/requirements.md` (Requisito 4).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { ValidationError } from "../domain/errors.js";
import { computePayoutCents } from "../domain/models.js";
import type { Cents } from "../domain/money.js";
import type { ProviderPayout } from "../domain/models.js";
import type { PayoutRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface ComputePayoutInput {
  readonly providerId: string;
  readonly invoiceItemId: string;
  readonly baseCents: Cents;
  /** Taxa em pontos-base (0..10000). Ex.: 5000 = 50%. */
  readonly rateBasisPoints: number;
}

export interface PayoutServiceDeps {
  readonly payouts: PayoutRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class PayoutService {
  constructor(private readonly deps: PayoutServiceDeps) {}

  /** Calcula e registra um repasse. Requer finance:manage. */
  async compute(
    actor: TenantContext,
    input: ComputePayoutInput,
  ): Promise<ProviderPayout> {
    this.deps.authorization.ensure(actor, "finance:manage", actor.tenantId);

    if (!Number.isInteger(input.baseCents) || input.baseCents < 0) {
      throw new ValidationError("Base do repasse invalida.");
    }
    if (
      !Number.isInteger(input.rateBasisPoints) ||
      input.rateBasisPoints < 0 ||
      input.rateBasisPoints > 10000
    ) {
      throw new ValidationError("Taxa de repasse invalida (0..10000 pontos-base).");
    }

    const amountCents = computePayoutCents(input.baseCents, input.rateBasisPoints);
    const payout = await this.deps.payouts.create({
      tenantId: actor.tenantId,
      providerId: input.providerId,
      invoiceItemId: input.invoiceItemId,
      baseCents: input.baseCents,
      rateBasisPoints: input.rateBasisPoints,
      amountCents,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "payout.computed",
      resourceType: "provider_payout",
      resourceId: payout.id,
    });

    return payout;
  }

  /** Lista repasses de um profissional. Requer finance:read. */
  async listForProvider(
    actor: TenantContext,
    providerId: string,
  ): Promise<ProviderPayout[]> {
    this.deps.authorization.ensure(actor, "finance:read", actor.tenantId);
    return this.deps.payouts.listForProvider(actor.tenantId, providerId);
  }
}
