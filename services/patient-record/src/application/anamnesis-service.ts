/**
 * AnamnesisService: anamnese do paciente com historico versionado.
 *
 * Cada atualizacao cria uma nova versao; a anterior e preservada. Requer
 * patient:manage para escrever e patient:read para consultar. Auditado.
 *
 * Ver `.kiro/specs/patient-record/requirements.md` (Requisito 4).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError } from "../domain/errors.js";
import type { Anamnesis, PatientId } from "../domain/models.js";
import type { AnamnesisRepository, PatientRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface AnamnesisServiceDeps {
  readonly anamneses: AnamnesisRepository;
  readonly patients: PatientRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class AnamnesisService {
  constructor(private readonly deps: AnamnesisServiceDeps) {}

  /** Registra uma nova versao da anamnese. Requer patient:manage. */
  async update(
    actor: TenantContext,
    patientId: PatientId,
    answers: Record<string, unknown>,
  ): Promise<Anamnesis> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);

    const patient = await this.deps.patients.findById(actor.tenantId, patientId);
    if (!patient) {
      throw new NotFoundError("Paciente nao encontrado.");
    }

    const current = await this.deps.anamneses.currentForPatient(
      actor.tenantId,
      patientId,
    );
    const nextVersion = current ? current.version + 1 : 1;

    const anamnesis = await this.deps.anamneses.insertVersion({
      tenantId: actor.tenantId,
      patientId,
      version: nextVersion,
      answers,
      authorUserId: actor.userId,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "anamnesis.updated",
      resourceType: "anamnesis",
      resourceId: patientId,
      metadata: { version: nextVersion },
    });

    return anamnesis;
  }

  /** Retorna a versao atual da anamnese. Requer patient:read. Auditado. */
  async current(actor: TenantContext, patientId: PatientId): Promise<Anamnesis | null> {
    this.deps.authorization.ensure(actor, "patient:read", actor.tenantId);
    const anamnesis = await this.deps.anamneses.currentForPatient(
      actor.tenantId,
      patientId,
    );
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "anamnesis.accessed",
      resourceType: "anamnesis",
      resourceId: patientId,
    });
    return anamnesis;
  }
}
