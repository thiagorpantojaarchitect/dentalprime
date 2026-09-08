import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  InMemoryAcceptanceRepository,
  InMemoryAuditRepository,
  InMemoryPlanItemRepository,
  InMemoryPlanRepository,
  InMemoryProcedureRepository,
} from "../infrastructure/memory-repositories.js";
import { AcceptanceService } from "./acceptance-service.js";
import { AuditService } from "./audit-service.js";
import { InMemoryEventPublisher } from "./event-publisher.js";
import { PlanItemService } from "./plan-item-service.js";
import { ProcedureCatalogService } from "./procedure-catalog-service.js";
import { TreatmentPlanService } from "./treatment-plan-service.js";

export const TENANT_A = "11111111-1111-1111-1111-111111111111";
export const TENANT_B = "22222222-2222-2222-2222-222222222222";
export const PATIENT_A = "99999999-9999-9999-9999-999999999999";

export function makeContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: TENANT_A,
    userId: "user-1",
    roles: ["dentist"],
    units: [],
    ...overrides,
  };
}

export function buildEnv() {
  const procedureRepo = new InMemoryProcedureRepository();
  const planRepo = new InMemoryPlanRepository();
  const itemRepo = new InMemoryPlanItemRepository();
  const acceptanceRepo = new InMemoryAcceptanceRepository();
  const auditRepo = new InMemoryAuditRepository();
  const events = new InMemoryEventPublisher();

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  return {
    auditRepo,
    events,
    procedures: new ProcedureCatalogService({
      procedures: procedureRepo,
      audit,
      authorization,
    }),
    plans: new TreatmentPlanService({
      plans: planRepo,
      audit,
      events,
      authorization,
    }),
    items: new PlanItemService({
      items: itemRepo,
      plans: planRepo,
      procedures: procedureRepo,
      audit,
      events,
      authorization,
    }),
    acceptance: new AcceptanceService({
      acceptances: acceptanceRepo,
      items: itemRepo,
      plans: planRepo,
      audit,
      events,
      authorization,
    }),
  };
}
