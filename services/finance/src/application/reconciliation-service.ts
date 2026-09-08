/**
 * ReconciliationService: concilia o valor esperado com o recebido.
 *
 * Registra a diferenca (recebido - esperado). Se for zero, status "matched";
 * caso contrario, "divergent" (sinalizado para revisao). Valores em centavos.
 *
 * Ver `.kiro/specs/finance/requirements.md` (Requisito 5).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import type { Cents } from "../domain/money.js";
import type { Reconciliation } from "../domain/models.js";
import type { ReconciliationRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface ReconcileInput {
  readonly reference: string;
  readonly expectedCents: Cents;
  readonly receivedCents: Cents;
}

export interface ReconciliationServiceDeps {
  readonly reconciliations: ReconciliationRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class ReconciliationService {
  constructor(private readonly deps: ReconciliationServiceDeps) {}

  /** Concilia esperado x recebido e registra o resultado. Requer finance:manage. */
  async reconcile(actor: TenantContext, input: ReconcileInput): Promise<Reconciliation> {
    this.deps.authorization.ensure(actor, "finance:manage", actor.tenantId);

    const differenceCents = input.receivedCents - input.expectedCents;
    const status = differenceCents === 0 ? "matched" : "divergent";

    const reconciliation = await this.deps.reconciliations.create({
      tenantId: actor.tenantId,
      reference: input.reference,
      expectedCents: input.expectedCents,
      receivedCents: input.receivedCents,
      differenceCents,
      status,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action:
        status === "matched" ? "reconciliation.matched" : "reconciliation.divergent",
      resourceType: "reconciliation",
      resourceId: reconciliation.id,
    });

    return reconciliation;
  }
}
