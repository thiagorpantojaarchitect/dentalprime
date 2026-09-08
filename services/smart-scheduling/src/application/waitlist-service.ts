/**
 * WaitlistService: lista de espera e sugestao de encaixe.
 *
 * Ao liberar um horario (cancelamento/falta), sugere candidatos da lista de
 * espera do provider, ordenados por prioridade. As sugestoes sao ASSISTIVAS: a
 * confirmacao do encaixe e sempre humana (nao agenda automaticamente).
 *
 * Ver `.kiro/specs/smart-scheduling/requirements.md` (Requisito 5).
 */

import type { ClinicUnitId, TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import type { PatientId, ProviderId, WaitlistEntry } from "../domain/models.js";
import type { WaitlistRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface AddToWaitlistInput {
  readonly patientId: PatientId;
  readonly unitId: ClinicUnitId;
  readonly providerId?: ProviderId | null | undefined;
  readonly priority?: number | undefined;
}

export interface WaitlistServiceDeps {
  readonly waitlist: WaitlistRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class WaitlistService {
  constructor(private readonly deps: WaitlistServiceDeps) {}

  /** Adiciona um paciente a lista de espera. Requer appointment:manage. */
  async add(actor: TenantContext, input: AddToWaitlistInput): Promise<WaitlistEntry> {
    this.deps.authorization.ensure(actor, "appointment:manage", actor.tenantId);

    const entry = await this.deps.waitlist.add({
      tenantId: actor.tenantId,
      unitId: input.unitId,
      patientId: input.patientId,
      providerId: input.providerId ?? null,
      priority: input.priority ?? 0,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "waitlist.added",
      resourceType: "waitlist_entry",
      resourceId: entry.id,
    });

    return entry;
  }

  /**
   * Sugere candidatos ao encaixe para um provider, por ordem de prioridade.
   * Assistivo: nao agenda; apenas retorna a lista para decisao humana.
   * Requer appointment:read.
   */
  async suggestForProvider(
    actor: TenantContext,
    providerId: ProviderId,
    limit = 5,
  ): Promise<WaitlistEntry[]> {
    this.deps.authorization.ensure(actor, "appointment:read", actor.tenantId);
    const active = await this.deps.waitlist.listActiveForProvider(
      actor.tenantId,
      providerId,
    );
    return active.slice(0, limit);
  }

  /** Marca uma entrada como atendida (apos encaixe confirmado). Requer appointment:manage. */
  async markFulfilled(actor: TenantContext, entryId: string): Promise<void> {
    this.deps.authorization.ensure(actor, "appointment:manage", actor.tenantId);
    await this.deps.waitlist.markFulfilled(actor.tenantId, entryId);
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "waitlist.fulfilled",
      resourceType: "waitlist_entry",
      resourceId: entryId,
    });
  }
}
