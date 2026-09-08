/**
 * Composicao das dependencias de producao do treatment-plan.
 */

import { AcceptanceService } from "./application/acceptance-service.js";
import { AuditService } from "./application/audit-service.js";
import {
  NoopEventPublisher,
  type EventPublisher,
} from "./application/event-publisher.js";
import { PlanItemService } from "./application/plan-item-service.js";
import { ProcedureCatalogService } from "./application/procedure-catalog-service.js";
import { TreatmentPlanService } from "./application/treatment-plan-service.js";
import type { Config } from "./config.js";
import { AuthorizationService } from "./domain/authorization.js";
import { createDbConnection, type DbConnection } from "./infrastructure/db/client.js";
import {
  DrizzleAcceptanceRepository,
  DrizzleAuditRepository,
  DrizzlePlanItemRepository,
  DrizzlePlanRepository,
  DrizzleProcedureRepository,
} from "./infrastructure/repositories.js";
import type { AppDeps } from "./app.js";

export interface Composition extends AppDeps {
  readonly connection: DbConnection;
}

export function composeProduction(
  config: Config,
  eventPublisher: EventPublisher = new NoopEventPublisher(),
): Composition {
  const connection = createDbConnection(config.databaseUrl);
  const db = connection.db;

  const procedureRepo = new DrizzleProcedureRepository(db);
  const planRepo = new DrizzlePlanRepository(db);
  const itemRepo = new DrizzlePlanItemRepository(db);
  const acceptanceRepo = new DrizzleAcceptanceRepository(db);
  const auditRepo = new DrizzleAuditRepository(db);

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  const procedures = new ProcedureCatalogService({
    procedures: procedureRepo,
    audit,
    authorization,
  });
  const plans = new TreatmentPlanService({
    plans: planRepo,
    audit,
    events: eventPublisher,
    authorization,
  });
  const items = new PlanItemService({
    items: itemRepo,
    plans: planRepo,
    procedures: procedureRepo,
    audit,
    events: eventPublisher,
    authorization,
  });
  const acceptance = new AcceptanceService({
    acceptances: acceptanceRepo,
    items: itemRepo,
    plans: planRepo,
    audit,
    events: eventPublisher,
    authorization,
  });

  return {
    connection,
    jwtSecret: config.jwtSecret,
    procedures,
    plans,
    items,
    acceptance,
  };
}
