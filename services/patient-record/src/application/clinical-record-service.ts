/**
 * ClinicalRecordService: prontuario clinico versionado (append-only).
 *
 * - Criar entrada gera versao 1 com autoria e data/hora.
 * - Corrigir entrada cria uma nova versao (n+1) e marca a anterior como
 *   substituida; a versao antiga permanece consultavel. Nada e apagado.
 * - Consultar prontuario e auditado (acesso a dado clinico sensivel).
 *
 * Ver `.kiro/steering/clinical-safety.md` e `.kiro/specs/patient-record/requirements.md`
 * (Requisito 3).
 */

import type { TenantContext } from "@dentalprime/core";
import { randomUUID } from "node:crypto";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { ClinicalRecord, PatientId } from "../domain/models.js";
import type {
  ClinicalRecordRepository,
  PatientRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface CreateEntryInput {
  readonly patientId: PatientId;
  readonly entryType: string;
  readonly content: string;
}

export interface ClinicalRecordServiceDeps {
  readonly records: ClinicalRecordRepository;
  readonly patients: PatientRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class ClinicalRecordService {
  constructor(private readonly deps: ClinicalRecordServiceDeps) {}

  /** Cria uma nova entrada clinica (versao 1). Requer patient:manage. */
  async createEntry(
    actor: TenantContext,
    input: CreateEntryInput,
  ): Promise<ClinicalRecord> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);
    if (!input.content.trim()) {
      throw new ValidationError("Conteudo da entrada clinica e obrigatorio.");
    }

    const patient = await this.deps.patients.findById(actor.tenantId, input.patientId);
    if (!patient) {
      throw new NotFoundError("Paciente nao encontrado.");
    }

    const recordKey = randomUUID();
    const record = await this.deps.records.insertVersion({
      tenantId: actor.tenantId,
      patientId: input.patientId,
      recordKey,
      version: 1,
      entryType: input.entryType,
      content: input.content,
      authorUserId: actor.userId,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "clinical_record.created",
      resourceType: "clinical_record",
      resourceId: recordKey,
      metadata: { patientId: input.patientId, entryType: input.entryType, version: 1 },
    });

    return record;
  }

  /**
   * Corrige uma entrada existente criando uma nova versao. A versao anterior e
   * marcada como substituida, mas preservada. Requer patient:manage.
   */
  async correctEntry(
    actor: TenantContext,
    recordKey: string,
    newContent: string,
  ): Promise<ClinicalRecord> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);
    if (!newContent.trim()) {
      throw new ValidationError("Conteudo da correcao e obrigatorio.");
    }

    const current = await this.deps.records.currentVersion(actor.tenantId, recordKey);
    if (!current) {
      throw new NotFoundError("Entrada clinica nao encontrada.");
    }

    const nextVersion = current.version + 1;
    const corrected = await this.deps.records.insertVersion({
      tenantId: actor.tenantId,
      patientId: current.patientId,
      recordKey,
      version: nextVersion,
      entryType: current.entryType,
      content: newContent,
      authorUserId: actor.userId,
    });

    // Preserva o historico: marca a versao anterior como substituida.
    await this.deps.records.markSuperseded(
      actor.tenantId,
      recordKey,
      current.version,
      nextVersion,
    );

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "clinical_record.corrected",
      resourceType: "clinical_record",
      resourceId: recordKey,
      metadata: {
        patientId: current.patientId,
        fromVersion: current.version,
        toVersion: nextVersion,
      },
    });

    return corrected;
  }

  /** Lista as entradas atuais (nao substituidas) de um paciente. Auditado. */
  async listForPatient(
    actor: TenantContext,
    patientId: PatientId,
  ): Promise<ClinicalRecord[]> {
    this.deps.authorization.ensure(actor, "patient:read", actor.tenantId);
    const records = await this.deps.records.listCurrentForPatient(
      actor.tenantId,
      patientId,
    );
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "clinical_record.accessed",
      resourceType: "clinical_record",
      resourceId: patientId,
      metadata: { count: records.length },
    });
    return records;
  }

  /** Historico completo (todas as versoes) de uma entrada. Auditado. */
  async history(actor: TenantContext, recordKey: string): Promise<ClinicalRecord[]> {
    this.deps.authorization.ensure(actor, "patient:read", actor.tenantId);
    const versions = await this.deps.records.listVersions(actor.tenantId, recordKey);
    if (versions.length === 0) {
      throw new NotFoundError("Entrada clinica nao encontrada.");
    }
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "clinical_record.history_accessed",
      resourceType: "clinical_record",
      resourceId: recordKey,
    });
    return versions;
  }
}
