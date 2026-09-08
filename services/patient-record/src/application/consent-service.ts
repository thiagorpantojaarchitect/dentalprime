/**
 * ConsentService: gestao de consentimento LGPD por finalidade.
 *
 * Registra concessao/revogacao com finalidade, versao do termo e data. A
 * verificacao (`hasConsent`) e usada por outros fluxos para checar base legal
 * antes de tratar dados. `ensureConsent` bloqueia com ConsentRequiredError.
 *
 * Ver `.kiro/specs/patient-record/requirements.md` (Requisito 2).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError } from "../domain/errors.js";
import { ConsentRequiredError } from "../domain/errors.js";
import type { PatientConsent, PatientId } from "../domain/models.js";
import type { ConsentRepository, PatientRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface ConsentServiceDeps {
  readonly consents: ConsentRepository;
  readonly patients: PatientRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class ConsentService {
  constructor(private readonly deps: ConsentServiceDeps) {}

  /** Registra concessao de consentimento para uma finalidade. */
  async grant(
    actor: TenantContext,
    patientId: PatientId,
    purpose: string,
    termVersion: string,
  ): Promise<PatientConsent> {
    return this.write(actor, patientId, purpose, termVersion, "granted");
  }

  /** Registra revogacao de consentimento para uma finalidade. */
  async revoke(
    actor: TenantContext,
    patientId: PatientId,
    purpose: string,
    termVersion: string,
  ): Promise<PatientConsent> {
    return this.write(actor, patientId, purpose, termVersion, "revoked");
  }

  /**
   * Indica se ha consentimento vigente (ultimo registro = granted) para a
   * finalidade. Nao exige autorizacao especial: e uma checagem interna de base
   * legal.
   */
  async hasConsent(
    tenantId: string,
    patientId: PatientId,
    purpose: string,
  ): Promise<boolean> {
    const latest = await this.deps.consents.latestForPurpose(
      tenantId,
      patientId,
      purpose,
    );
    return latest?.status === "granted";
  }

  /** Lanca ConsentRequiredError se nao houver consentimento vigente. */
  async ensureConsent(
    tenantId: string,
    patientId: PatientId,
    purpose: string,
  ): Promise<void> {
    if (!(await this.hasConsent(tenantId, patientId, purpose))) {
      throw new ConsentRequiredError(purpose);
    }
  }

  private async write(
    actor: TenantContext,
    patientId: PatientId,
    purpose: string,
    termVersion: string,
    status: "granted" | "revoked",
  ): Promise<PatientConsent> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);

    const patient = await this.deps.patients.findById(actor.tenantId, patientId);
    if (!patient) {
      throw new NotFoundError("Paciente nao encontrado.");
    }

    const consent = await this.deps.consents.record({
      tenantId: actor.tenantId,
      patientId,
      purpose,
      termVersion,
      status,
      recordedBy: actor.userId,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: status === "granted" ? "consent.granted" : "consent.revoked",
      resourceType: "patient_consent",
      resourceId: consent.id,
      metadata: { patientId, purpose, termVersion },
    });

    return consent;
  }
}
