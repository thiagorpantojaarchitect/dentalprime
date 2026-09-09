export { buildApp, type AppDeps } from "./app.js";
export { composeProduction, type Composition } from "./composition.js";
export { loadConfig, type Config } from "./config.js";

export { LeadService, InteractionService } from "./application/lead-service.js";
export { CampaignService, SegmentService } from "./application/campaign-service.js";
export { ConsentService } from "./application/consent-service.js";
export { AuditService } from "./application/audit-service.js";

export { AuthorizationService } from "./domain/authorization.js";
export * from "./domain/errors.js";
