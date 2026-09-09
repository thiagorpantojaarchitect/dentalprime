/**
 * Composicao das dependencias de producao do ai-front-desk.
 *
 * O AIProvider e injetado (plugavel). Por ora usamos o StubAIProvider; um
 * adaptador real (Bedrock/OpenAI/privado) pode ser injetado sem alterar o
 * dominio, com chaves resolvidas do Secrets Manager em runtime.
 */

import { StubAIProvider, type AIProvider } from "./application/ai-provider.js";
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

export function composeProduction(
  config: Config,
  aiProvider: AIProvider = new StubAIProvider(),
): Composition {
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
  };
}
