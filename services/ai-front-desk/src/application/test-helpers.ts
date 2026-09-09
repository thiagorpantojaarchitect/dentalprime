import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  InMemoryAIActionLogRepository,
  InMemoryAuditRepository,
  InMemoryConversationRepository,
  InMemoryHandoffRepository,
  InMemoryMessageRepository,
} from "../infrastructure/memory-repositories.js";
import { StubAIProvider } from "./ai-provider.js";
import { AuditService } from "./audit-service.js";
import { ConversationService } from "./conversation-service.js";
import { HandoffService, SchedulingSuggestionService } from "./handoff-service.js";

export const TENANT_A = "11111111-1111-1111-1111-111111111111";
export const TENANT_B = "22222222-2222-2222-2222-222222222222";

export function makeContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: TENANT_A,
    userId: "user-1",
    roles: ["front-desk"],
    units: [],
    ...overrides,
  };
}

export function buildEnv() {
  const conversationRepo = new InMemoryConversationRepository();
  const messageRepo = new InMemoryMessageRepository();
  const handoffRepo = new InMemoryHandoffRepository();
  const actionLogRepo = new InMemoryAIActionLogRepository();
  const auditRepo = new InMemoryAuditRepository();

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();
  const ai = new StubAIProvider();

  return {
    auditRepo,
    handoffRepo,
    conversations: new ConversationService({
      conversations: conversationRepo,
      messages: messageRepo,
      handoffs: handoffRepo,
      ai,
      audit,
      authorization,
    }),
    handoffs: new HandoffService({
      handoffs: handoffRepo,
      conversations: conversationRepo,
      audit,
      authorization,
    }),
    suggestions: new SchedulingSuggestionService({
      actionLogs: actionLogRepo,
      conversations: conversationRepo,
      audit,
      authorization,
    }),
  };
}
