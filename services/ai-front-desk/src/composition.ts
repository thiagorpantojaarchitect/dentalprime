/**
 * Composicao das dependencias de producao do ai-front-desk.
 *
 * O AIProvider e injetado (plugavel). A raiz de execucao escolhe explicitamente
 * stub apenas em development ou Bedrock com configuracao completa; nunca ha
 * degradacao silenciosa entre provedores.
 */

import type { AIProvider } from "./application/ai-provider.js";
import { AuditService } from "./application/audit-service.js";
import { ConversationService } from "./application/conversation-service.js";
import {
  HandoffService,
  SchedulingSuggestionService,
} from "./application/handoff-service.js";
import type { Config } from "./config.js";
import { AuthorizationService } from "./domain/authorization.js";
import { createDbConnection, type DbConnection } from "./infrastructure/db/client.js";
import {
  DrizzleAIActionLogRepository,
  DrizzleAuditRepository,
  DrizzleConversationRepository,
  DrizzleHandoffRepository,
  DrizzleMessageRepository,
} from "./infrastructure/repositories.js";
import type { AppDeps } from "./app.js";

export interface Composition extends AppDeps {
  readonly connection: DbConnection;
}

export function composeProduction(config: Config, aiProvider: AIProvider): Composition {
  const connection = createDbConnection(config.databaseUrl);
  const db = connection.db;

  const conversationRepo = new DrizzleConversationRepository(db);
  const messageRepo = new DrizzleMessageRepository(db);
  const handoffRepo = new DrizzleHandoffRepository(db);
  const actionLogRepo = new DrizzleAIActionLogRepository(db);
  const auditRepo = new DrizzleAuditRepository(db);

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  const conversations = new ConversationService({
    conversations: conversationRepo,
    messages: messageRepo,
    handoffs: handoffRepo,
    ai: aiProvider,
    audit,
    authorization,
  });
  const handoffs = new HandoffService({
    handoffs: handoffRepo,
    conversations: conversationRepo,
    audit,
    authorization,
  });
  const suggestions = new SchedulingSuggestionService({
    actionLogs: actionLogRepo,
    conversations: conversationRepo,
    audit,
    authorization,
  });

  return {
    connection,
    jwtSecret: config.jwtSecret,
    conversations,
    handoffs,
    suggestions,
    trustProxy: config.trustProxy,
    readinessCheck: connection.checkReady,
  };
}
