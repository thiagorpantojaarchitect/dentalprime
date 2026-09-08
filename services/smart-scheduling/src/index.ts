export { buildApp, type AppDeps } from "./app.js";
export { composeProduction, type Composition } from "./composition.js";
export { loadConfig, type Config } from "./config.js";

export { AvailabilityService } from "./application/availability-service.js";
export { SchedulingService } from "./application/scheduling-service.js";
export { ReminderService } from "./application/reminder-service.js";
export { WaitlistService } from "./application/waitlist-service.js";
export { AuditService } from "./application/audit-service.js";
export {
  InMemoryEventPublisher,
  NoopEventPublisher,
  type EventPublisher,
} from "./application/event-publisher.js";

export { AuthorizationService } from "./domain/authorization.js";
export { intervalsOverlap } from "./domain/models.js";
export * from "./domain/errors.js";
