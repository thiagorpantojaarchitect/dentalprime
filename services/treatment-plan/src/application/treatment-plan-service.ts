/**
 * TreatmentPlanService: planos de tratamento versionados.
 *
 * - Criar plano gera versao 1 com autoria (rascunho).
 * - Revisar cria nova versao e marca a anterior como substituida, preservando o
 *   historico (nada apagado) — coerente com integridade clinica.
 * - Ativar/concluir/cancelar mudam o status da versao atual.
 *
 * Ver `.kiro/specs/treatment-plan/requirements.md` (Requisitos 1 e 4) e
 * `.kiro/steering/clinical-safety.md`.
 */

import type { TenantContext } from "@dentalprime/core";
import { randomUUID } from "node:crypto";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { PatientId, PlanKey, PlanStatus, TreatmentPlan } from "../domain/models.js";
import type { PlanRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { planCreatedEvent, type EventPublisher } from "./event-publisher.js";

export interface TreatmentPlanServiceDeps {
  readonly plans: PlanRepository;
  readonly audit: AuditService;
  readonly events: EventPublisher;
  readonly authorization: AuthorizationService;
}

export class TreatmentPlanService {
  constructor(private readonly deps: TreatmentPlanServiceDeps) {}

  /** Cria um plano (versao 1, rascunho). Requer treatment:manage. */
  async create(
    actor: TenantContext,
    patientId: PatientId,
    title: string,
  ): Promise<TreatmentPlan> {
    this.deps.authorization.ensure(actor, "treatment:manage", actor.tenantId);
    if (!title.trim()) {
      throw new ValidationError("Titulo do plano e obrigatorio.");
    }

    const planKey = randomUUID();
    const plan = await this.deps.plans.insertVersion({
      tenantId: actor.tenantId,
      patientId,
      planKey,
      version: 1,
      title: title.trim(),
      status: "draft",
      authorUserId: actor.userId,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "treatment_plan.created",
      resourceType: "treatment_plan",
      resourceId: planKey,
    });

    await this.deps.events.publish(
      planCreatedEvent(actor.tenantId, { planKey, patientId, version: 1 }),
    );

    return plan;
  }

  /**
   * Revisa o plano criando uma nova versao (mantendo autoria do revisor). A
   * versao anterior e preservada e marcada como substituida. Requer
   * treatment:manage.
   */
  async revise(
    actor: TenantContext,
    planKey: PlanKey,
    title: string,
  ): Promise<TreatmentPlan> {
    this.deps.authorization.ensure(actor, "treatment:manage", actor.tenantId);

    const current = await this.deps.plans.currentVersion(actor.tenantId, planKey);
    if (!current) {
      throw new NotFoundError("Plano nao encontrado.");
    }

    const nextVersion = current.version + 1;
    const revised = await this.deps.plans.insertVersion({
      tenantId: actor.tenantId,
      patientId: current.patientId,
      planKey,
      version: nextVersion,
      title: title.trim() || current.title,
      status: current.status === "draft" ? "draft" : current.status,
      authorUserId: actor.userId,
    });

    await this.deps.plans.markSuperseded(
      actor.tenantId,
      planKey,
      current.version,
      nextVersion,
    );

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "treatment_plan.revised",
      resourceType: "treatment_plan",
      resourceId: planKey,
    });

    return revised;
  }

  /** Muda o status da versao atual do plano. Requer treatment:manage. */
  async setStatus(
    actor: TenantContext,
    planKey: PlanKey,
    status: PlanStatus,
  ): Promise<TreatmentPlan> {
    this.deps.authorization.ensure(actor, "treatment:manage", actor.tenantId);

    const current = await this.deps.plans.currentVersion(actor.tenantId, planKey);
    if (!current) {
      throw new NotFoundError("Plano nao encontrado.");
    }

    await this.deps.plans.updateStatus(actor.tenantId, planKey, current.version, status);
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `treatment_plan.status.${status}`,
      resourceType: "treatment_plan",
      resourceId: planKey,
    });

    return { ...current, status };
  }

  /** Versao atual do plano. Requer treatment:read. */
  async current(actor: TenantContext, planKey: PlanKey): Promise<TreatmentPlan> {
    this.deps.authorization.ensure(actor, "treatment:read", actor.tenantId);
    const plan = await this.deps.plans.currentVersion(actor.tenantId, planKey);
    if (!plan) {
      throw new NotFoundError("Plano nao encontrado.");
    }
    return plan;
  }

  /** Historico de versoes do plano. Requer treatment:read. */
  async history(actor: TenantContext, planKey: PlanKey): Promise<TreatmentPlan[]> {
    this.deps.authorization.ensure(actor, "treatment:read", actor.tenantId);
    const versions = await this.deps.plans.listVersions(actor.tenantId, planKey);
    if (versions.length === 0) {
      throw new NotFoundError("Plano nao encontrado.");
    }
    return versions;
  }
}
