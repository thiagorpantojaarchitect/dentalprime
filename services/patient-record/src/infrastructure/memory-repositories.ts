/**
 * Implementacoes em memoria dos repositorios, para testes. Respeitam o mesmo
 * contrato de isolamento por tenant e o versionamento append-only do prontuario.
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { randomUUID } from "node:crypto";

import type {
  Anamnesis,
  AuditEntry,
  ClinicalRecord,
  ConsentStatus,
  OdontogramEntry,
  Patient,
  PatientConsent,
  PatientId,
} from "../domain/models.js";
import type {
  AnamnesisRepository,
  AuditRepository,
  ClinicalRecordRepository,
  ConsentRepository,
  CreatePatientInput,
  OdontogramRepository,
  PatientRepository,
  UpdatePatientInput,
} from "../domain/repositories.js";

export class InMemoryPatientRepository implements PatientRepository {
  private readonly rows = new Map<string, Patient>();

  async findById(tenantId: TenantId, patientId: PatientId): Promise<Patient | null> {
    const p = this.rows.get(patientId);
    return p && p.tenantId === tenantId ? p : null;
  }

  async findByCpf(tenantId: TenantId, cpf: string): Promise<Patient | null> {
    for (const p of this.rows.values()) {
      if (p.tenantId === tenantId && p.cpf === cpf) return p;
    }
    return null;
  }

  async create(input: CreatePatientInput): Promise<Patient> {
    const patient: Patient = {
      id: randomUUID(),
      tenantId: input.tenantId,
      fullName: input.fullName,
      cpf: input.cpf,
      birthDate: input.birthDate,
      email: input.email,
      phone: input.phone,
      address: input.address,
      active: true,
    };
    this.rows.set(patient.id, patient);
    return patient;
  }

  async update(
    tenantId: TenantId,
    patientId: PatientId,
    input: UpdatePatientInput,
  ): Promise<Patient> {
    const current = await this.findById(tenantId, patientId);
    if (!current) throw new Error("paciente nao encontrado");
    const updated: Patient = {
      ...current,
      fullName: input.fullName ?? current.fullName,
      birthDate: input.birthDate !== undefined ? input.birthDate : current.birthDate,
      email: input.email !== undefined ? input.email : current.email,
      phone: input.phone !== undefined ? input.phone : current.phone,
      address: input.address !== undefined ? input.address : current.address,
      active: input.active ?? current.active,
    };
    this.rows.set(patientId, updated);
    return updated;
  }
}

export class InMemoryConsentRepository implements ConsentRepository {
  private readonly rows: PatientConsent[] = [];

  async latestForPurpose(
    tenantId: TenantId,
    patientId: PatientId,
    purpose: string,
  ): Promise<PatientConsent | null> {
    // Percorre do fim para o inicio: a ordem de insercao e cronologica, o que
    // desempata registros com o mesmo timestamp (ex.: grant e revoke no mesmo
    // milissegundo). O ultimo inserido e o mais recente.
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const c = this.rows[i]!;
      if (c.tenantId === tenantId && c.patientId === patientId && c.purpose === purpose) {
        return c;
      }
    }
    return null;
  }

  async record(input: {
    tenantId: TenantId;
    patientId: PatientId;
    purpose: string;
    termVersion: string;
    status: ConsentStatus;
    recordedBy: UserId;
  }): Promise<PatientConsent> {
    const consent: PatientConsent = {
      id: randomUUID(),
      tenantId: input.tenantId,
      patientId: input.patientId,
      purpose: input.purpose,
      termVersion: input.termVersion,
      status: input.status,
      recordedAt: new Date(),
    };
    this.rows.push(consent);
    return consent;
  }
}

export class InMemoryClinicalRecordRepository implements ClinicalRecordRepository {
  private readonly rows: ClinicalRecord[] = [];

  async currentVersion(
    tenantId: TenantId,
    recordKey: string,
  ): Promise<ClinicalRecord | null> {
    const versions = this.rows
      .filter((r) => r.tenantId === tenantId && r.recordKey === recordKey)
      .sort((a, b) => b.version - a.version);
    return versions[0] ?? null;
  }

  async listVersions(tenantId: TenantId, recordKey: string): Promise<ClinicalRecord[]> {
    return this.rows
      .filter((r) => r.tenantId === tenantId && r.recordKey === recordKey)
      .sort((a, b) => a.version - b.version);
  }

  async listCurrentForPatient(
    tenantId: TenantId,
    patientId: PatientId,
  ): Promise<ClinicalRecord[]> {
    return this.rows.filter(
      (r) =>
        r.tenantId === tenantId &&
        r.patientId === patientId &&
        r.supersededByVersion === null,
    );
  }

  async insertVersion(input: {
    tenantId: TenantId;
    patientId: PatientId;
    recordKey: string;
    version: number;
    entryType: string;
    content: string;
    authorUserId: UserId;
  }): Promise<ClinicalRecord> {
    const record: ClinicalRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      patientId: input.patientId,
      recordKey: input.recordKey,
      version: input.version,
      entryType: input.entryType,
      content: input.content,
      authorUserId: input.authorUserId,
      supersededByVersion: null,
      createdAt: new Date(),
    };
    this.rows.push(record);
    return record;
  }

  async markSuperseded(
    tenantId: TenantId,
    recordKey: string,
    version: number,
    supersededByVersion: number,
  ): Promise<void> {
    const idx = this.rows.findIndex(
      (r) =>
        r.tenantId === tenantId && r.recordKey === recordKey && r.version === version,
    );
    if (idx >= 0) {
      this.rows[idx] = { ...this.rows[idx]!, supersededByVersion };
    }
  }
}

export class InMemoryAnamnesisRepository implements AnamnesisRepository {
  private readonly rows: Anamnesis[] = [];

  async currentForPatient(
    tenantId: TenantId,
    patientId: PatientId,
  ): Promise<Anamnesis | null> {
    const versions = this.rows
      .filter((a) => a.tenantId === tenantId && a.patientId === patientId)
      .sort((a, b) => b.version - a.version);
    return versions[0] ?? null;
  }

  async insertVersion(input: {
    tenantId: TenantId;
    patientId: PatientId;
    version: number;
    answers: Record<string, unknown>;
    authorUserId: UserId;
  }): Promise<Anamnesis> {
    const anamnesis: Anamnesis = {
      id: randomUUID(),
      tenantId: input.tenantId,
      patientId: input.patientId,
      version: input.version,
      answers: input.answers,
      authorUserId: input.authorUserId,
      createdAt: new Date(),
    };
    this.rows.push(anamnesis);
    return anamnesis;
  }
}

export class InMemoryOdontogramRepository implements OdontogramRepository {
  private readonly rows: OdontogramEntry[] = [];

  async listForPatient(
    tenantId: TenantId,
    patientId: PatientId,
  ): Promise<OdontogramEntry[]> {
    return this.rows.filter((o) => o.tenantId === tenantId && o.patientId === patientId);
  }

  async add(input: {
    tenantId: TenantId;
    patientId: PatientId;
    toothNumber: number;
    surface: string | null;
    condition: string;
    critical: boolean;
    authorUserId: UserId;
  }): Promise<OdontogramEntry> {
    const entry: OdontogramEntry = {
      id: randomUUID(),
      tenantId: input.tenantId,
      patientId: input.patientId,
      toothNumber: input.toothNumber,
      surface: input.surface,
      condition: input.condition,
      critical: input.critical,
      authorUserId: input.authorUserId,
      createdAt: new Date(),
    };
    this.rows.push(entry);
    return entry;
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  public readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
