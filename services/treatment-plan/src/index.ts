export { buildApp, type AppDeps } from "./app.js";
export { composeProduction, type Composition } from "./composition.js";
export { loadConfig, type Config } from "./config.js";

export { ProcedureCatalogService } from "./application/procedure-catalog-service.js";
export { TreatmentPlanService } from "./application/treatment-plan-service.js";
export { PlanItemService } from "./application/plan-item-service.js";
export { AcceptanceService } from "./application/acceptance-service.js";
export { AuditService } from "./application/audit-service.js";
export {
  InMemoryEventPublisher,
  NoopEventPublisher,
  type EventPublisher,
} from "./application/event-publisher.js";

export { AuthorizationService } from "./domain/authorization.js";
export * from "./domain/errors.js";
