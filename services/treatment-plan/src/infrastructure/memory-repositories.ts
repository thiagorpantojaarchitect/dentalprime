/**
 * Implementacoes em memoria dos repositorios, para testes. Respeitam o mesmo
 * contrato de isolamento por tenant e o versionamento append-only dos planos.
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { randomUUID } from "node:crypto";

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
} from "../domain/models.js";
import type {
  AcceptanceRepository,
  AuditRepository,
  PlanItemRepository,
  PlanRepository,
  ProcedureRepository,
} from "../domain/repositories.js";

export class InMemoryProcedureRepository implements ProcedureRepository {
  private readonly rows = new Map<string, Procedure>();

  async findById(
    tenantId: TenantId,
    procedureId: ProcedureId,
  ): Promise<Procedure | null> {
    const p = this.rows.get(procedureId);
    return p && p.tenantId === tenantId ? p : null;
  }

  async findByName(tenantId: TenantId, name: string): Promise<Procedure | null> {
    for (const p of this.rows.values()) {
      if (p.tenantId === tenantId && p.name === name) return p;
    }
    return null;
  }

  async create(input: {
    tenantId: TenantId;
    name: string;
    description: string | null;
    baseCost: string;
  }): Promise<Procedure> {
    const procedure: Procedure = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      baseCost: input.baseCost,
      active: true,
    };
    this.rows.set(procedure.id, procedure);
    return procedure;
  }

  async listActive(tenantId: TenantId): Promise<Procedure[]> {
    return [...this.rows.values()].filter((p) => p.tenantId === tenantId && p.active);
  }
}

export class InMemoryPlanRepository implements PlanRepository {
  private readonly rows: TreatmentPlan[] = [];

  async currentVersion(
    tenantId: TenantId,
    planKey: PlanKey,
  ): Promise<TreatmentPlan | null> {
    const versions = this.rows
      .filter((p) => p.tenantId === tenantId && p.planKey === planKey)
      .sort((a, b) => b.version - a.version);
    return versions[0] ?? null;
  }

  async listVersions(tenantId: TenantId, planKey: PlanKey): Promise<TreatmentPlan[]> {
    return this.rows
      .filter((p) => p.tenantId === tenantId && p.planKey === planKey)
      .sort((a, b) => a.version - b.version);
  }

  async insertVersion(input: {
    tenantId: TenantId;
    patientId: PatientId;
    planKey: PlanKey;
    version: number;
    title: string;
    status: TreatmentPlan["status"];
    authorUserId: UserId;
  }): Promise<TreatmentPlan> {
    const plan: TreatmentPlan = {
      id: randomUUID(),
      tenantId: input.tenantId,
      patientId: input.patientId,
      planKey: input.planKey,
      version: input.version,
      title: input.title,
      status: input.status,
      authorUserId: input.authorUserId,
      supersededByVersion: null,
      createdAt: new Date(),
    };
    this.rows.push(plan);
    return plan;
  }

  async markSuperseded(
    tenantId: TenantId,
    planKey: PlanKey,
    version: number,
    supersededByVersion: number,
  ): Promise<void> {
    const idx = this.rows.findIndex(
      (p) => p.tenantId === tenantId && p.planKey === planKey && p.version === version,
    );
    if (idx >= 0) {
      this.rows[idx] = { ...this.rows[idx]!, supersededByVersion };
    }
  }

  async updateStatus(
    tenantId: TenantId,
    planKey: PlanKey,
    version: number,
    status: TreatmentPlan["status"],
  ): Promise<void> {
    const idx = this.rows.findIndex(
      (p) => p.tenantId === tenantId && p.planKey === planKey && p.version === version,
    );
    if (idx >= 0) {
      this.rows[idx] = { ...this.rows[idx]!, status };
    }
  }
}

export class InMemoryPlanItemRepository implements PlanItemRepository {
  private readonly rows = new Map<string, TreatmentPlanItem>();

  async findById(
    tenantId: TenantId,
    itemId: PlanItemId,
  ): Promise<TreatmentPlanItem | null> {
    const item = this.rows.get(itemId);
    return item && item.tenantId === tenantId ? item : null;
  }

  async listForPlanVersion(
    tenantId: TenantId,
    planKey: PlanKey,
    planVersion: number,
  ): Promise<TreatmentPlanItem[]> {
    return [...this.rows.values()].filter(
      (i) =>
        i.tenantId === tenantId && i.planKey === planKey && i.planVersion === planVersion,
    );
  }

  async add(input: {
    tenantId: TenantId;
    planKey: PlanKey;
    planVersion: number;
    procedureId: ProcedureId;
    estimatedCost: string;
    phase: number;
    orderInPhase: number;
    dependsOnItemId: PlanItemId | null;
  }): Promise<TreatmentPlanItem> {
    const item: TreatmentPlanItem = {
      id: randomUUID(),
      tenantId: input.tenantId,
      planKey: input.planKey,
      planVersion: input.planVersion,
      procedureId: input.procedureId,
      estimatedCost: input.estimatedCost,
      phase: input.phase,
      orderInPhase: input.orderInPhase,
      dependsOnItemId: input.dependsOnItemId,
      status: "proposed",
    };
    this.rows.set(item.id, item);
    return item;
  }

  async updateStatus(
    tenantId: TenantId,
    itemId: PlanItemId,
    status: ItemStatus,
  ): Promise<TreatmentPlanItem> {
    const current = await this.findById(tenantId, itemId);
    if (!current) throw new Error("item nao encontrado");
    const updated: TreatmentPlanItem = { ...current, status };
    this.rows.set(itemId, updated);
    return updated;
  }
}

export class InMemoryAcceptanceRepository implements AcceptanceRepository {
  private readonly rows: PlanAcceptance[] = [];

  async record(input: {
    tenantId: TenantId;
    planKey: PlanKey;
    itemId: PlanItemId | null;
    decision: AcceptanceDecision;
    decidedByUserId: UserId;
    note: string | null;
  }): Promise<PlanAcceptance> {
    const acceptance: PlanAcceptance = {
      id: randomUUID(),
      tenantId: input.tenantId,
      planKey: input.planKey,
      itemId: input.itemId,
      decision: input.decision,
      decidedByUserId: input.decidedByUserId,
      note: input.note,
      decidedAt: new Date(),
    };
    this.rows.push(acceptance);
    return acceptance;
  }

  async listForPlan(tenantId: TenantId, planKey: PlanKey): Promise<PlanAcceptance[]> {
    return this.rows.filter((a) => a.tenantId === tenantId && a.planKey === planKey);
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  public readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
