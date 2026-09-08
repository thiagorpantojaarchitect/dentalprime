/**
 * Implementacoes Drizzle dos repositorios do patient-record, com isolamento por
 * tenant. Cada consulta filtra por `tenantId`. O prontuario e append-only:
 * novas versoes sao inseridas; versoes antigas apenas marcadas como
 * substituidas (markSuperseded), nunca apagadas.
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { and, desc, eq, isNull } from "drizzle-orm";

import type {
  Anamnesis,
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
import type { AuditEntry } from "../domain/models.js";
import type { Database } from "./db/client.js";
import {
  anamneses,
  auditLogs,
  clinicalRecords,
  odontogramEntries,
  patientConsents,
  patients,
} from "./db/schema.js";

function toPatient(row: typeof patients.$inferSelect): Patient {
  return {
    id: row.id,
    tenantId: row.tenantId,
    fullName: row.fullName,
    cpf: row.cpf,
    birthDate: row.birthDate,
    email: row.email,
    phone: row.phone,
    address: (row.address as Record<string, unknown> | null) ?? null,
    active: row.active,
  };
}

export class DrizzlePatientRepository implements PatientRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, patientId: PatientId): Promise<Patient | null> {
    const rows = await this.db
      .select()
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId)))
      .limit(1);
    return rows[0] ? toPatient(rows[0]) : null;
  }

  async findByCpf(tenantId: TenantId, cpf: string): Promise<Patient | null> {
    const rows = await this.db
      .select()
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.cpf, cpf)))
      .limit(1);
    return rows[0] ? toPatient(rows[0]) : null;
  }

  async create(input: CreatePatientInput): Promise<Patient> {
    const rows = await this.db
      .insert(patients)
      .values({
        tenantId: input.tenantId,
        fullName: input.fullName,
        cpf: input.cpf,
        birthDate: input.birthDate,
        email: input.email,
        phone: input.phone,
        address: input.address,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      })
      .returning();
    return toPatient(rows[0]!);
  }

  async update(
    tenantId: TenantId,
    patientId: PatientId,
    input: UpdatePatientInput,
  ): Promise<Patient> {
    const set: Partial<typeof patients.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: input.updatedBy,
    };
    if (input.fullName !== undefined) set.fullName = input.fullName;
    if (input.birthDate !== undefined) set.birthDate = input.birthDate;
    if (input.email !== undefined) set.email = input.email;
    if (input.phone !== undefined) set.phone = input.phone;
    if (input.address !== undefined) set.address = input.address;
    if (input.active !== undefined) set.active = input.active;

    const rows = await this.db
      .update(patients)
      .set(set)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId)))
      .returning();
    return toPatient(rows[0]!);
  }
}

export class DrizzleConsentRepository implements ConsentRepository {
  constructor(private readonly db: Database) {}

  async latestForPurpose(
    tenantId: TenantId,
    patientId: PatientId,
    purpose: string,
  ): Promise<PatientConsent | null> {
    const rows = await this.db
      .select()
      .from(patientConsents)
      .where(
        and(
          eq(patientConsents.tenantId, tenantId),
          eq(patientConsents.patientId, patientId),
          eq(patientConsents.purpose, purpose),
        ),
      )
      .orderBy(desc(patientConsents.recordedAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      purpose: row.purpose,
      termVersion: row.termVersion,
      status: row.status,
      recordedAt: row.recordedAt,
    };
  }

  async record(input: {
    tenantId: TenantId;
    patientId: PatientId;
    purpose: string;
    termVersion: string;
    status: ConsentStatus;
    recordedBy: UserId;
  }): Promise<PatientConsent> {
    const rows = await this.db
      .insert(patientConsents)
      .values({
        tenantId: input.tenantId,
        patientId: input.patientId,
        purpose: input.purpose,
        termVersion: input.termVersion,
        status: input.status,
        recordedBy: input.recordedBy,
      })
      .returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      purpose: row.purpose,
      termVersion: row.termVersion,
      status: row.status,
      recordedAt: row.recordedAt,
    };
  }
}

function toClinicalRecord(row: typeof clinicalRecords.$inferSelect): ClinicalRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    patientId: row.patientId,
    recordKey: row.recordKey,
    version: row.version,
    entryType: row.entryType,
    content: row.content,
    authorUserId: row.authorUserId,
    supersededByVersion: row.supersededByVersion,
    createdAt: row.createdAt,
  };
}

export class DrizzleClinicalRecordRepository implements ClinicalRecordRepository {
  constructor(private readonly db: Database) {}

  async currentVersion(
    tenantId: TenantId,
    recordKey: string,
  ): Promise<ClinicalRecord | null> {
    const rows = await this.db
      .select()
      .from(clinicalRecords)
      .where(
        and(
          eq(clinicalRecords.tenantId, tenantId),
          eq(clinicalRecords.recordKey, recordKey),
        ),
      )
      .orderBy(desc(clinicalRecords.version))
      .limit(1);
    return rows[0] ? toClinicalRecord(rows[0]) : null;
  }

  async listVersions(tenantId: TenantId, recordKey: string): Promise<ClinicalRecord[]> {
    const rows = await this.db
      .select()
      .from(clinicalRecords)
      .where(
        and(
          eq(clinicalRecords.tenantId, tenantId),
          eq(clinicalRecords.recordKey, recordKey),
        ),
      )
      .orderBy(clinicalRecords.version);
    return rows.map(toClinicalRecord);
  }

  async listCurrentForPatient(
    tenantId: TenantId,
    patientId: PatientId,
  ): Promise<ClinicalRecord[]> {
    const rows = await this.db
      .select()
      .from(clinicalRecords)
      .where(
        and(
          eq(clinicalRecords.tenantId, tenantId),
          eq(clinicalRecords.patientId, patientId),
          isNull(clinicalRecords.supersededByVersion),
        ),
      );
    return rows.map(toClinicalRecord);
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
    const rows = await this.db
      .insert(clinicalRecords)
      .values({
        tenantId: input.tenantId,
        patientId: input.patientId,
        recordKey: input.recordKey,
        version: input.version,
        entryType: input.entryType,
        content: input.content,
        authorUserId: input.authorUserId,
      })
      .returning();
    return toClinicalRecord(rows[0]!);
  }

  async markSuperseded(
    tenantId: TenantId,
    recordKey: string,
    version: number,
    supersededByVersion: number,
  ): Promise<void> {
    await this.db
      .update(clinicalRecords)
      .set({ supersededByVersion })
      .where(
        and(
          eq(clinicalRecords.tenantId, tenantId),
          eq(clinicalRecords.recordKey, recordKey),
          eq(clinicalRecords.version, version),
        ),
      );
  }
}

export class DrizzleAnamnesisRepository implements AnamnesisRepository {
  constructor(private readonly db: Database) {}

  async currentForPatient(
    tenantId: TenantId,
    patientId: PatientId,
  ): Promise<Anamnesis | null> {
    const rows = await this.db
      .select()
      .from(anamneses)
      .where(and(eq(anamneses.tenantId, tenantId), eq(anamneses.patientId, patientId)))
      .orderBy(desc(anamneses.version))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      version: row.version,
      answers: row.answers as Record<string, unknown>,
      authorUserId: row.authorUserId,
      createdAt: row.createdAt,
    };
  }

  async insertVersion(input: {
    tenantId: TenantId;
    patientId: PatientId;
    version: number;
    answers: Record<string, unknown>;
    authorUserId: UserId;
  }): Promise<Anamnesis> {
    const rows = await this.db
      .insert(anamneses)
      .values({
        tenantId: input.tenantId,
        patientId: input.patientId,
        version: input.version,
        answers: input.answers,
        authorUserId: input.authorUserId,
      })
      .returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      version: row.version,
      answers: row.answers as Record<string, unknown>,
      authorUserId: row.authorUserId,
      createdAt: row.createdAt,
    };
  }
}

export class DrizzleOdontogramRepository implements OdontogramRepository {
  constructor(private readonly db: Database) {}

  async listForPatient(
    tenantId: TenantId,
    patientId: PatientId,
  ): Promise<OdontogramEntry[]> {
    const rows = await this.db
      .select()
      .from(odontogramEntries)
      .where(
        and(
          eq(odontogramEntries.tenantId, tenantId),
          eq(odontogramEntries.patientId, patientId),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      toothNumber: row.toothNumber,
      surface: row.surface,
      condition: row.condition,
      critical: row.critical,
      authorUserId: row.authorUserId,
      createdAt: row.createdAt,
    }));
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
    const rows = await this.db
      .insert(odontogramEntries)
      .values({
        tenantId: input.tenantId,
        patientId: input.patientId,
        toothNumber: input.toothNumber,
        surface: input.surface,
        condition: input.condition,
        critical: input.critical,
        authorUserId: input.authorUserId,
      })
      .returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      toothNumber: row.toothNumber,
      surface: row.surface,
      condition: row.condition,
      critical: row.critical,
      authorUserId: row.authorUserId,
      createdAt: row.createdAt,
    };
  }
}

export class DrizzleAuditRepository implements AuditRepository {
  constructor(private readonly db: Database) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLogs).values({
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata,
      ipAddress: entry.ipAddress,
    });
  }
}
