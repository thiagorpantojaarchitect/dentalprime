/**
 * PatientRightsService: direitos do titular (LGPD).
 *
 * - Acesso/portabilidade: exporta os dados do paciente em formato estruturado.
 * - Eliminacao: respeita a obrigacao legal de guarda de prontuario. Quando ha
 *   registro clinico, a eliminacao total nao e permitida; aplica-se
 *   anonimizacao dos dados de identificacao (PII), preservando o prontuario
 *   para fins legais. Sem registro clinico, o paciente pode ser desativado.
 *
 * Toda operacao e auditada.
 *
 * Ver `.kiro/specs/patient-record/requirements.md` (Requisito 6) e
 * `.kiro/steering/security-lgpd.md`.
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError } from "../domain/errors.js";
import type { Patient, PatientId } from "../domain/models.js";
import type {
  ClinicalRecordRepository,
  PatientRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface PatientDataExport {
  readonly patient: Patient;
  readonly clinicalRecordCount: number;
  readonly exportedAt: string;
}

export type ErasureOutcome =
  | { readonly result: "deactivated" }
  | { readonly result: "anonymized"; readonly reason: string };

export interface PatientRightsServiceDeps {
  readonly patients: PatientRepository;
  readonly records: ClinicalRecordRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class PatientRightsService {
  constructor(private readonly deps: PatientRightsServiceDeps) {}

  /** Exporta os dados do paciente (acesso/portabilidade). Requer patient:read. */
  async export(actor: TenantContext, patientId: PatientId): Promise<PatientDataExport> {
    this.deps.authorization.ensure(actor, "patient:read", actor.tenantId);

    const patient = await this.deps.patients.findById(actor.tenantId, patientId);
    if (!patient) {
      throw new NotFoundError("Paciente nao encontrado.");
    }
    const records = await this.deps.records.listCurrentForPatient(
      actor.tenantId,
      patientId,
    );

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "patient.data_exported",
      resourceType: "patient",
      resourceId: patientId,
    });

    return {
      patient,
      clinicalRecordCount: records.length,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Solicitacao de eliminacao. Requer patient:manage.
   *
   * Se houver prontuario clinico, a lei exige guarda: nesse caso os dados de
   * identificacao sao anonimizados (nao apagados) e o paciente desativado, mas
   * o prontuario e preservado. Sem prontuario, o paciente e apenas desativado.
   */
  async requestErasure(
    actor: TenantContext,
    patientId: PatientId,
  ): Promise<ErasureOutcome> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);

    const patient = await this.deps.patients.findById(actor.tenantId, patientId);
    if (!patient) {
      throw new NotFoundError("Paciente nao encontrado.");
    }

    const records = await this.deps.records.listCurrentForPatient(
      actor.tenantId,
      patientId,
    );
    const hasClinicalHistory = records.length > 0;

    if (hasClinicalHistory) {
      // Anonimiza PII, preserva prontuario por obrigacao legal de guarda.
      await this.deps.patients.update(actor.tenantId, patientId, {
        fullName: "TITULAR ANONIMIZADO",
        email: null,
        phone: null,
        address: null,
        active: false,
        updatedBy: actor.userId,
      });
      await this.deps.audit.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "patient.anonymized",
        resourceType: "patient",
        resourceId: patientId,
        metadata: { reason: "clinical_record_retention" },
      });
      return {
        result: "anonymized",
        reason: "Prontuario clinico deve ser preservado por obrigacao legal de guarda.",
      };
    }

    // Sem prontuario: desativa o paciente.
    await this.deps.patients.update(actor.tenantId, patientId, {
      active: false,
      updatedBy: actor.userId,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "patient.deactivated",
      resourceType: "patient",
      resourceId: patientId,
    });
    return { result: "deactivated" };
  }
}
