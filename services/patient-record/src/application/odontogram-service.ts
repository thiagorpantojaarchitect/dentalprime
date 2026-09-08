/**
 * OdontogramService: mapa dental por dente/face.
 *
 * Registra condicoes por dente (notacao FDI) e face. Alertas clinicos (ex.:
 * alergia relevante ao tratamento) sao marcados como criticos para destaque.
 * Requer patient:manage para escrever e patient:read para consultar. Auditado.
 *
 * Ver `.kiro/specs/patient-record/requirements.md` (Requisito 4).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { OdontogramEntry, PatientId } from "../domain/models.js";
import type { OdontogramRepository, PatientRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface AddOdontogramEntryInput {
  readonly patientId: PatientId;
  readonly toothNumber: number;
  readonly surface?: string | null | undefined;
  readonly condition: string;
  readonly critical?: boolean | undefined;
}

export interface OdontogramServiceDeps {
  readonly odontogram: OdontogramRepository;
  readonly patients: PatientRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class OdontogramService {
  constructor(private readonly deps: OdontogramServiceDeps) {}

  /** Adiciona uma condicao ao odontograma. Requer patient:manage. */
  async addEntry(
    actor: TenantContext,
    input: AddOdontogramEntryInput,
  ): Promise<OdontogramEntry> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);

    // Notacao FDI: dentes permanentes 11-48; deciduos 51-85.
    if (
      !Number.isInteger(input.toothNumber) ||
      input.toothNumber < 11 ||
      input.toothNumber > 85
    ) {
      throw new ValidationError("Numero de dente invalido (notacao FDI).");
    }
    if (!input.condition.trim()) {
      throw new ValidationError("Condicao e obrigatoria.");
    }

    const patient = await this.deps.patients.findById(actor.tenantId, input.patientId);
    if (!patient) {
      throw new NotFoundError("Paciente nao encontrado.");
    }

    const entry = await this.deps.odontogram.add({
      tenantId: actor.tenantId,
      patientId: input.patientId,
      toothNumber: input.toothNumber,
      surface: input.surface ?? null,
      condition: input.condition,
      critical: input.critical ?? false,
      authorUserId: actor.userId,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "odontogram.entry_added",
      resourceType: "odontogram_entry",
      resourceId: entry.id,
      metadata: {
        patientId: input.patientId,
        toothNumber: input.toothNumber,
        critical: entry.critical,
      },
    });

    return entry;
  }

  /** Lista o odontograma de um paciente. Requer patient:read. Auditado. */
  async listForPatient(
    actor: TenantContext,
    patientId: PatientId,
  ): Promise<OdontogramEntry[]> {
    this.deps.authorization.ensure(actor, "patient:read", actor.tenantId);
    const entries = await this.deps.odontogram.listForPatient(actor.tenantId, patientId);
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "odontogram.accessed",
      resourceType: "odontogram_entry",
      resourceId: patientId,
    });
    return entries;
  }
}
