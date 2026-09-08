/**
 * AcceptanceService: registra decisoes de aceitacao de plano/item.
 *
 * - Decisao sobre o plano inteiro ou sobre um item especifico (accepted/
 *   declined/deferred), com historico append-only.
 * - Ao ACEITAR um item, marca o item como "accepted" e publica
 *   TreatmentItemAccepted para o modulo finance gerar a cobranca.
 *
 * A decisao e sempre humana e auditada (aceitacao de casos).
 *
 * Ver `.kiro/specs/treatment-plan/requirements.md` (Requisito 3).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError } from "../domain/errors.js";
import type {
  AcceptanceDecision,
  PlanAcceptance,
  PlanItemId,
  PlanKey,
} from "../domain/models.js";
import type {
  AcceptanceRepository,
  PlanItemRepository,
  PlanRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { itemAcceptedEvent, type EventPublisher } from "./event-publisher.js";

export interface AcceptanceServiceDeps {
  readonly acceptances: AcceptanceRepository;
  readonly items: PlanItemRepository;
  readonly plans: PlanRepository;
  readonly audit: AuditService;
  readonly events: EventPublisher;
  readonly authorization: AuthorizationService;
}

export class AcceptanceService {
  constructor(private readonly deps: AcceptanceServiceDeps) {}

  /**
   * Registra a decisao do paciente sobre um item do plano. Requer
   * treatment:accept. Ao aceitar, marca o item e publica evento para finance.
   */
  async decideItem(
    actor: TenantContext,
    planKey: PlanKey,
    itemId: PlanItemId,
    decision: AcceptanceDecision,
    note: string | null = null,
  ): Promise<PlanAcceptance> {
    this.deps.authorization.ensure(actor, "treatment:accept", actor.tenantId);

    const item = await this.deps.items.findById(actor.tenantId, itemId);
    if (!item || item.planKey !== planKey) {
      throw new NotFoundError("Item do plano nao encontrado.");
    }

    const acceptance = await this.deps.acceptances.record({
      tenantId: actor.tenantId,
      planKey,
      itemId,
      decision,
      decidedByUserId: actor.userId,
      note,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `treatment.item.${decision}`,
      resourceType: "plan_acceptance",
      resourceId: acceptance.id,
    });

    if (decision === "accepted" && item.status === "proposed") {
      await this.deps.items.updateStatus(actor.tenantId, itemId, "accepted");
      await this.deps.events.publish(
        itemAcceptedEvent(actor.tenantId, {
          planKey,
          itemId,
          procedureId: item.procedureId,
          estimatedCost: item.estimatedCost,
        }),
      );
    }

    return acceptance;
  }

  /** Registra a decisao sobre o plano inteiro. Requer treatment:accept. */
  async decidePlan(
    actor: TenantContext,
    planKey: PlanKey,
    decision: AcceptanceDecision,
    note: string | null = null,
  ): Promise<PlanAcceptance> {
    this.deps.authorization.ensure(actor, "treatment:accept", actor.tenantId);

    const plan = await this.deps.plans.currentVersion(actor.tenantId, planKey);
    if (!plan) {
      throw new NotFoundError("Plano nao encontrado.");
    }

    const acceptance = await this.deps.acceptances.record({
      tenantId: actor.tenantId,
      planKey,
      itemId: null,
      decision,
      decidedByUserId: actor.userId,
      note,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `treatment.plan.${decision}`,
      resourceType: "plan_acceptance",
      resourceId: acceptance.id,
    });

    return acceptance;
  }

  /** Historico de decisoes de um plano. Requer treatment:read. */
  async history(actor: TenantContext, planKey: PlanKey): Promise<PlanAcceptance[]> {
    this.deps.authorization.ensure(actor, "treatment:read", actor.tenantId);
    return this.deps.acceptances.listForPlan(actor.tenantId, planKey);
  }
}
