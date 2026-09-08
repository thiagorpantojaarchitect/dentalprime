/**
 * Contratos de repositorio do patient-record. Todo metodo recebe `tenantId`
 * explicitamente e a implementacao aplica o filtro por tenant em toda consulta.
 */

import type { TenantId, UserId } from "@dentalprime/core";

import type {
  Anamnesis,
  AuditEntry,
  ClinicalRecord,
  ConsentStatus,
  OdontogramEntry,
  Patient,
  PatientConsent,
  PatientId,
} from "./models.js";

export interface CreatePatientInput {
  readonly tenantId: TenantId;
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: Record<string, unknown> | null;
  readonly createdBy: UserId;
}

export interface UpdatePatientInput {
  readonly fullName?: string | undefined;
  readonly birthDate?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly address?: Record<string, unknown> | null | undefined;
  readonly active?: boolean | undefined;
  readonly updatedBy: UserId;
}

export interface PatientRepository {
  findById(tenantId: TenantId, patientId: PatientId): Promise<Patient | null>;
  findByCpf(tenantId: TenantId, cpf: string): Promise<Patient | null>;
  create(input: CreatePatientInput): Promise<Patient>;
  update(
    tenantId: TenantId,
    patientId: PatientId,
    input: UpdatePatientInput,
  ): Promise<Patient>;
}

export interface ConsentRepository {
  /** Ultimo registro de consentimento para (paciente, finalidade). */
  latestForPurpose(
    tenantId: TenantId,
    patientId: PatientId,
    purpose: string,
  ): Promise<PatientConsent | null>;
  record(input: {
    tenantId: TenantId;
    patientId: PatientId;
    purpose: string;
    termVersion: string;
    status: ConsentStatus;
    recordedBy: UserId;
  }): Promise<PatientConsent>;
}

export interface ClinicalRecordRepository {
  /** Maior versao atual para uma entrada logica (recordKey). */
  currentVersion(tenantId: TenantId, recordKey: string): Promise<ClinicalRecord | null>;
  /** Todas as versoes de uma entrada, em ordem crescente de versao. */
  listVersions(tenantId: TenantId, recordKey: string): Promise<ClinicalRecord[]>;
  /** Entradas atuais (nao substituidas) de um paciente. */
  listCurrentForPatient(
    tenantId: TenantId,
    patientId: PatientId,
  ): Promise<ClinicalRecord[]>;
  insertVersion(input: {
    tenantId: TenantId;
    patientId: PatientId;
    recordKey: string;
    version: number;
    entryType: string;
    content: string;
    authorUserId: UserId;
  }): Promise<ClinicalRecord>;
  /** Marca uma versao como substituida (historico), sem apagar. */
  markSuperseded(
    tenantId: TenantId,
    recordKey: string,
    version: number,
    supersededByVersion: number,
  ): Promise<void>;
}

export interface AnamnesisRepository {
  currentForPatient(tenantId: TenantId, patientId: PatientId): Promise<Anamnesis | null>;
  insertVersion(input: {
    tenantId: TenantId;
    patientId: PatientId;
    version: number;
    answers: Record<string, unknown>;
    authorUserId: UserId;
  }): Promise<Anamnesis>;
}

export interface OdontogramRepository {
  listForPatient(tenantId: TenantId, patientId: PatientId): Promise<OdontogramEntry[]>;
  add(input: {
    tenantId: TenantId;
    patientId: PatientId;
    toothNumber: number;
    surface: string | null;
    condition: string;
    critical: boolean;
    authorUserId: UserId;
  }): Promise<OdontogramEntry>;
}

export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>;
}
