export { buildApp, type AppDeps } from "./app.js";
export { composeProduction, type Composition } from "./composition.js";
export { loadConfig, type Config } from "./config.js";

export { ConversationService } from "./application/conversation-service.js";
export {
  HandoffService,
  SchedulingSuggestionService,
} from "./application/handoff-service.js";
export { AuditService } from "./application/audit-service.js";
export { StubAIProvider, type AIProvider } from "./application/ai-provider.js";

export { AuthorizationService } from "./domain/authorization.js";
export { requestsClinicalContent } from "./domain/guardrails.js";
export * from "./domain/errors.js";
