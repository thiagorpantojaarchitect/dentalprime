/**
 * PlanItemService: itens de um plano de tratamento.
 *
 * Adiciona itens (procedimento, custo estimado, fase, ordem, dependencia) a
 * versao atual do plano e gerencia transicoes de status do item. Publica
 * TreatmentItemCompleted quando concluido.
 *
 * Ver `.kiro/specs/treatment-plan/requirements.md` (Requisitos 2 e 4).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type {
  ItemStatus,
  PlanItemId,
  PlanKey,
  ProcedureId,
  TreatmentPlanItem,
} from "../domain/models.js";
import type {
  PlanItemRepository,
  PlanRepository,
  ProcedureRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { itemCompletedEvent, type EventPublisher } from "./event-publisher.js";

export interface AddItemInput {
  readonly planKey: PlanKey;
  readonly procedureId: ProcedureId;
  readonly phase?: number | undefined;
  readonly orderInPhase?: number | undefined;
  readonly dependsOnItemId?: PlanItemId | null | undefined;
  /** Custo estimado opcional; se ausente, usa o custo base do procedimento. */
  readonly estimatedCost?: string | null | undefined;
}

/** Transicoes de status validas de item. */
const ALLOWED_TRANSITIONS: Readonly<Record<ItemStatus, readonly ItemStatus[]>> = {
  proposed: ["accepted", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export interface PlanItemServiceDeps {
  readonly items: PlanItemRepository;
  readonly plans: PlanRepository;
  readonly procedures: ProcedureRepository;
  readonly audit: AuditService;
  readonly events: EventPublisher;
  readonly authorization: AuthorizationService;
}

export class PlanItemService {
  constructor(private readonly deps: PlanItemServiceDeps) {}

  /** Adiciona um item a versao atual do plano. Requer treatment:manage. */
  async addItem(actor: TenantContext, input: AddItemInput): Promise<TreatmentPlanItem> {
    this.deps.authorization.ensure(actor, "treatment:manage", actor.tenantId);

    const plan = await this.deps.plans.currentVersion(actor.tenantId, input.planKey);
    if (!plan) {
      throw new NotFoundError("Plano nao encontrado.");
    }

    const procedure = await this.deps.procedures.findById(
      actor.tenantId,
      input.procedureId,
    );
    if (!procedure) {
      throw new NotFoundError("Procedimento nao encontrado no catalogo.");
    }

    const estimatedCost = input.estimatedCost ?? procedure.baseCost;
    if (!/^\d+(\.\d{1,2})?$/.test(estimatedCost)) {
      throw new ValidationError("Custo estimado invalido.");
    }

    const item = await this.deps.items.add({
      tenantId: actor.tenantId,
      planKey: input.planKey,
      planVersion: plan.version,
      procedureId: input.procedureId,
      estimatedCost,
      phase: input.phase ?? 1,
      orderInPhase: input.orderInPhase ?? 0,
      dependsOnItemId: input.dependsOnItemId ?? null,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "treatment_plan_item.added",
      resourceType: "treatment_plan_item",
      resourceId: item.id,
    });

    return item;
  }

  /** Muda o status de um item validando a transicao. Requer treatment:manage. */
  async changeStatus(
    actor: TenantContext,
    itemId: PlanItemId,
    toStatus: ItemStatus,
  ): Promise<TreatmentPlanItem> {
    this.deps.authorization.ensure(actor, "treatment:manage", actor.tenantId);

    const current = await this.deps.items.findById(actor.tenantId, itemId);
    if (!current) {
      throw new NotFoundError("Item nao encontrado.");
    }

    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(toStatus)) {
      throw new ValidationError(
        `Transicao de status invalida: ${current.status} -> ${toStatus}.`,
      );
    }

    const updated = await this.deps.items.updateStatus(actor.tenantId, itemId, toStatus);

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `treatment_plan_item.status.${toStatus}`,
      resourceType: "treatment_plan_item",
      resourceId: itemId,
    });

    if (toStatus === "completed") {
      await this.deps.events.publish(
        itemCompletedEvent(actor.tenantId, { planKey: current.planKey, itemId }),
      );
    }

    return updated;
  }

  /** Itens da versao atual do plano. Requer treatment:read. */
  async listForCurrentPlan(
    actor: TenantContext,
    planKey: PlanKey,
  ): Promise<TreatmentPlanItem[]> {
    this.deps.authorization.ensure(actor, "treatment:read", actor.tenantId);
    const plan = await this.deps.plans.currentVersion(actor.tenantId, planKey);
    if (!plan) {
      throw new NotFoundError("Plano nao encontrado.");
    }
    return this.deps.items.listForPlanVersion(actor.tenantId, planKey, plan.version);
  }
}
