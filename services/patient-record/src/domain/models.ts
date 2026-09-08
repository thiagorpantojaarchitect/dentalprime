/**
 * Modelos de dominio do patient-record.
 */

import type { TenantId, UserId } from "@dentalprime/core";

export type PatientId = string;

export interface Patient {
  readonly id: PatientId;
  readonly tenantId: TenantId;
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: Record<string, unknown> | null;
  readonly active: boolean;
}

export type ConsentStatus = "granted" | "revoked";

export interface PatientConsent {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly patientId: PatientId;
  readonly purpose: string;
  readonly termVersion: string;
  readonly status: ConsentStatus;
  readonly recordedAt: Date;
}

export interface ClinicalRecord {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly patientId: PatientId;
  readonly recordKey: string;
  readonly version: number;
  readonly entryType: string;
  readonly content: string;
  readonly authorUserId: UserId;
  readonly supersededByVersion: number | null;
  readonly createdAt: Date;
}

export interface Anamnesis {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly patientId: PatientId;
  readonly version: number;
  readonly answers: Record<string, unknown>;
  readonly authorUserId: UserId;
  readonly createdAt: Date;
}

export interface OdontogramEntry {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly patientId: PatientId;
  readonly toothNumber: number;
  readonly surface: string | null;
  readonly condition: string;
  readonly critical: boolean;
  readonly authorUserId: UserId;
  readonly createdAt: Date;
}

export interface AuditEntry {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly ipAddress: string | null;
}
