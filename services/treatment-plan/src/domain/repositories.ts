/**
 * Contratos de repositorio do treatment-plan. Todo metodo recebe `tenantId`
 * explicitamente; a implementacao aplica o filtro por tenant em toda consulta.
 */

import type { TenantId, UserId } from "@dentalprime/core";

import type {
  AcceptanceDecision,
  AuditEntry,
  ItemStatus,
  PatientId,
  PlanAcceptance,
  PlanItemId,
  PlanKey,
  Procedure,
  ProcedureId,
  TreatmentPlan,
  TreatmentPlanItem,
} from "./models.js";

export interface ProcedureRepository {
  findById(tenantId: TenantId, procedureId: ProcedureId): Promise<Procedure | null>;
  findByName(tenantId: TenantId, name: string): Promise<Procedure | null>;
  create(input: {
    tenantId: TenantId;
    name: string;
    description: string | null;
    baseCost: string;
  }): Promise<Procedure>;
  listActive(tenantId: TenantId): Promise<Procedure[]>;
}

export interface PlanRepository {
  currentVersion(tenantId: TenantId, planKey: PlanKey): Promise<TreatmentPlan | null>;
  listVersions(tenantId: TenantId, planKey: PlanKey): Promise<TreatmentPlan[]>;
  insertVersion(input: {
    tenantId: TenantId;
    patientId: PatientId;
    planKey: PlanKey;
    version: number;
    title: string;
    status: TreatmentPlan["status"];
    authorUserId: UserId;
  }): Promise<TreatmentPlan>;
  markSuperseded(
    tenantId: TenantId,
    planKey: PlanKey,
    version: number,
    supersededByVersion: number,
  ): Promise<void>;
  updateStatus(
    tenantId: TenantId,
    planKey: PlanKey,
    version: number,
    status: TreatmentPlan["status"],
  ): Promise<void>;
}

export interface PlanItemRepository {
  findById(tenantId: TenantId, itemId: PlanItemId): Promise<TreatmentPlanItem | null>;
  listForPlanVersion(
    tenantId: TenantId,
    planKey: PlanKey,
    planVersion: number,
  ): Promise<TreatmentPlanItem[]>;
  add(input: {
    tenantId: TenantId;
    planKey: PlanKey;
    planVersion: number;
    procedureId: ProcedureId;
    estimatedCost: string;
    phase: number;
    orderInPhase: number;
    dependsOnItemId: PlanItemId | null;
  }): Promise<TreatmentPlanItem>;
  updateStatus(
    tenantId: TenantId,
    itemId: PlanItemId,
    status: ItemStatus,
  ): Promise<TreatmentPlanItem>;
}

export interface AcceptanceRepository {
  record(input: {
    tenantId: TenantId;
    planKey: PlanKey;
    itemId: PlanItemId | null;
    decision: AcceptanceDecision;
    decidedByUserId: UserId;
    note: string | null;
  }): Promise<PlanAcceptance>;
  listForPlan(tenantId: TenantId, planKey: PlanKey): Promise<PlanAcceptance[]>;
}

export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>;
}
