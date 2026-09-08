/**
 * Modelos de dominio do treatment-plan.
 *
 * Valores monetarios sao representados como string decimal (ex.: "1200.00")
 * para preservar precisao fixa, coerente com a coluna numeric do Postgres.
 */

import type { TenantId, UserId } from "@dentalprime/core";

export type ProcedureId = string;
export type PatientId = string;
export type PlanKey = string;
export type PlanItemId = string;

export type PlanStatus = "draft" | "active" | "completed" | "cancelled";

export type ItemStatus =
  | "proposed"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

export type AcceptanceDecision = "accepted" | "declined" | "deferred";

export interface Procedure {
  readonly id: ProcedureId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string | null;
  readonly baseCost: string;
  readonly active: boolean;
}

export interface TreatmentPlan {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly patientId: PatientId;
  readonly planKey: PlanKey;
  readonly version: number;
  readonly title: string;
  readonly status: PlanStatus;
  readonly authorUserId: UserId;
  readonly supersededByVersion: number | null;
  readonly createdAt: Date;
}

export interface TreatmentPlanItem {
  readonly id: PlanItemId;
  readonly tenantId: TenantId;
  readonly planKey: PlanKey;
  readonly planVersion: number;
  readonly procedureId: ProcedureId;
  readonly estimatedCost: string;
  readonly phase: number;
  readonly orderInPhase: number;
  readonly dependsOnItemId: PlanItemId | null;
  readonly status: ItemStatus;
}

export interface PlanAcceptance {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly planKey: PlanKey;
  readonly itemId: PlanItemId | null;
  readonly decision: AcceptanceDecision;
  readonly decidedByUserId: UserId;
  readonly note: string | null;
  readonly decidedAt: Date;
}

export interface AuditEntry {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly ipAddress: string | null;
}
