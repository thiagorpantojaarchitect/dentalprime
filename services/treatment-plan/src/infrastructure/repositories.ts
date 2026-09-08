/**
 * Implementacoes Drizzle dos repositorios do treatment-plan, com isolamento por
 * tenant. Cada consulta filtra por `tenantId`. Planos sao append-only por versao.
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { and, desc, eq } from "drizzle-orm";

import type {
  AcceptanceDecision,
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
import type { AuditEntry } from "../domain/models.js";
import type { Database } from "./db/client.js";
import {
  auditLogs,
  planAcceptances,
  procedureCatalog,
  treatmentPlanItems,
  treatmentPlans,
} from "./db/schema.js";

function toProcedure(row: typeof procedureCatalog.$inferSelect): Procedure {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    baseCost: row.baseCost,
    active: row.active,
  };
}

export class DrizzleProcedureRepository implements ProcedureRepository {
  constructor(private readonly db: Database) {}

  async findById(
    tenantId: TenantId,
    procedureId: ProcedureId,
  ): Promise<Procedure | null> {
    const rows = await this.db
      .select()
      .from(procedureCatalog)
      .where(
        and(
          eq(procedureCatalog.tenantId, tenantId),
          eq(procedureCatalog.id, procedureId),
        ),
      )
      .limit(1);
    return rows[0] ? toProcedure(rows[0]) : null;
  }

  async findByName(tenantId: TenantId, name: string): Promise<Procedure | null> {
    const rows = await this.db
      .select()
      .from(procedureCatalog)
      .where(
        and(eq(procedureCatalog.tenantId, tenantId), eq(procedureCatalog.name, name)),
      )
      .limit(1);
    return rows[0] ? toProcedure(rows[0]) : null;
  }

  async create(input: {
    tenantId: TenantId;
    name: string;
    description: string | null;
    baseCost: string;
  }): Promise<Procedure> {
    const rows = await this.db.insert(procedureCatalog).values(input).returning();
    return toProcedure(rows[0]!);
  }

  async listActive(tenantId: TenantId): Promise<Procedure[]> {
    const rows = await this.db
      .select()
      .from(procedureCatalog)
      .where(
        and(eq(procedureCatalog.tenantId, tenantId), eq(procedureCatalog.active, true)),
      );
    return rows.map(toProcedure);
  }
}

function toPlan(row: typeof treatmentPlans.$inferSelect): TreatmentPlan {
  return {
    id: row.id,
    tenantId: row.tenantId,
    patientId: row.patientId,
    planKey: row.planKey,
    version: row.version,
    title: row.title,
    status: row.status,
    authorUserId: row.authorUserId,
    supersededByVersion: row.supersededByVersion,
    createdAt: row.createdAt,
  };
}

export class DrizzlePlanRepository implements PlanRepository {
  constructor(private readonly db: Database) {}

  async currentVersion(
    tenantId: TenantId,
    planKey: PlanKey,
  ): Promise<TreatmentPlan | null> {
    const rows = await this.db
      .select()
      .from(treatmentPlans)
      .where(
        and(eq(treatmentPlans.tenantId, tenantId), eq(treatmentPlans.planKey, planKey)),
      )
      .orderBy(desc(treatmentPlans.version))
      .limit(1);
    return rows[0] ? toPlan(rows[0]) : null;
  }

  async listVersions(tenantId: TenantId, planKey: PlanKey): Promise<TreatmentPlan[]> {
    const rows = await this.db
      .select()
      .from(treatmentPlans)
      .where(
        and(eq(treatmentPlans.tenantId, tenantId), eq(treatmentPlans.planKey, planKey)),
      )
      .orderBy(treatmentPlans.version);
    return rows.map(toPlan);
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
    const rows = await this.db.insert(treatmentPlans).values(input).returning();
    return toPlan(rows[0]!);
  }

  async markSuperseded(
    tenantId: TenantId,
    planKey: PlanKey,
    version: number,
    supersededByVersion: number,
  ): Promise<void> {
    await this.db
      .update(treatmentPlans)
      .set({ supersededByVersion })
      .where(
        and(
          eq(treatmentPlans.tenantId, tenantId),
          eq(treatmentPlans.planKey, planKey),
          eq(treatmentPlans.version, version),
        ),
      );
  }

  async updateStatus(
    tenantId: TenantId,
    planKey: PlanKey,
    version: number,
    status: TreatmentPlan["status"],
  ): Promise<void> {
    await this.db
      .update(treatmentPlans)
      .set({ status })
      .where(
        and(
          eq(treatmentPlans.tenantId, tenantId),
          eq(treatmentPlans.planKey, planKey),
          eq(treatmentPlans.version, version),
        ),
      );
  }
}

function toItem(row: typeof treatmentPlanItems.$inferSelect): TreatmentPlanItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    planKey: row.planKey,
    planVersion: row.planVersion,
    procedureId: row.procedureId,
    estimatedCost: row.estimatedCost,
    phase: row.phase,
    orderInPhase: row.orderInPhase,
    dependsOnItemId: row.dependsOnItemId,
    status: row.status,
  };
}

export class DrizzlePlanItemRepository implements PlanItemRepository {
  constructor(private readonly db: Database) {}

  async findById(
    tenantId: TenantId,
    itemId: PlanItemId,
  ): Promise<TreatmentPlanItem | null> {
    const rows = await this.db
      .select()
      .from(treatmentPlanItems)
      .where(
        and(eq(treatmentPlanItems.tenantId, tenantId), eq(treatmentPlanItems.id, itemId)),
      )
      .limit(1);
    return rows[0] ? toItem(rows[0]) : null;
  }

  async listForPlanVersion(
    tenantId: TenantId,
    planKey: PlanKey,
    planVersion: number,
  ): Promise<TreatmentPlanItem[]> {
    const rows = await this.db
      .select()
      .from(treatmentPlanItems)
      .where(
        and(
          eq(treatmentPlanItems.tenantId, tenantId),
          eq(treatmentPlanItems.planKey, planKey),
          eq(treatmentPlanItems.planVersion, planVersion),
        ),
      );
    return rows.map(toItem);
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
    const rows = await this.db.insert(treatmentPlanItems).values(input).returning();
    return toItem(rows[0]!);
  }

  async updateStatus(
    tenantId: TenantId,
    itemId: PlanItemId,
    status: ItemStatus,
  ): Promise<TreatmentPlanItem> {
    const rows = await this.db
      .update(treatmentPlanItems)
      .set({ status, updatedAt: new Date() })
      .where(
        and(eq(treatmentPlanItems.tenantId, tenantId), eq(treatmentPlanItems.id, itemId)),
      )
      .returning();
    return toItem(rows[0]!);
  }
}

export class DrizzleAcceptanceRepository implements AcceptanceRepository {
  constructor(private readonly db: Database) {}

  async record(input: {
    tenantId: TenantId;
    planKey: PlanKey;
    itemId: PlanItemId | null;
    decision: AcceptanceDecision;
    decidedByUserId: UserId;
    note: string | null;
  }): Promise<PlanAcceptance> {
    const rows = await this.db.insert(planAcceptances).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      planKey: row.planKey,
      itemId: row.itemId,
      decision: row.decision,
      decidedByUserId: row.decidedByUserId,
      note: row.note,
      decidedAt: row.decidedAt,
    };
  }

  async listForPlan(tenantId: TenantId, planKey: PlanKey): Promise<PlanAcceptance[]> {
    const rows = await this.db
      .select()
      .from(planAcceptances)
      .where(
        and(eq(planAcceptances.tenantId, tenantId), eq(planAcceptances.planKey, planKey)),
      )
      .orderBy(planAcceptances.decidedAt);
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      planKey: row.planKey,
      itemId: row.itemId,
      decision: row.decision,
      decidedByUserId: row.decidedByUserId,
      note: row.note,
      decidedAt: row.decidedAt,
    }));
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
      ipAddress: entry.ipAddress,
    });
  }
}
