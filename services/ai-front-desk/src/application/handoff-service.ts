/**
 * HandoffService: transferencia de atendimento para humano.
 * SchedulingSuggestionService: sugestao assistiva de agendamento (nao agenda).
 *
 * Ver `.kiro/specs/ai-front-desk/requirements.md` (Requisitos 3, 4 e 5).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError } from "../domain/errors.js";
import type {
  AIActionLog,
  ConversationId,
  Handoff,
  HandoffTrigger,
} from "../domain/models.js";
import type {
  AIActionLogRepository,
  ConversationRepository,
  HandoffRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface HandoffServiceDeps {
  readonly handoffs: HandoffRepository;
  readonly conversations: ConversationRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class HandoffService {
  constructor(private readonly deps: HandoffServiceDeps) {}

  /**
   * Registra um handoff e marca a conversa para atendimento humano. Requer
   * frontdesk:manage.
   */
  async requestHandoff(
    actor: TenantContext,
    conversationId: ConversationId,
    reason: string,
    triggeredBy: HandoffTrigger,
  ): Promise<Handoff> {
    this.deps.authorization.ensure(actor, "frontdesk:manage", actor.tenantId);

    const conversation = await this.deps.conversations.findById(
      actor.tenantId,
      conversationId,
    );
    if (!conversation) {
      throw new NotFoundError("Conversa nao encontrada.");
    }

    const handoff = await this.deps.handoffs.create({
      tenantId: actor.tenantId,
      conversationId,
      reason,
      triggeredBy,
    });
    await this.deps.conversations.setStatus(actor.tenantId, conversationId, "handoff");

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "conversation.handoff",
      resourceType: "handoff",
      resourceId: handoff.id,
    });

    return handoff;
  }
}

export interface SuggestionInput {
  readonly conversationId: ConversationId;
  readonly suggestedSlots: readonly string[];
}

export interface SchedulingSuggestionServiceDeps {
  readonly actionLogs: AIActionLogRepository;
  readonly conversations: ConversationRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class SchedulingSuggestionService {
  constructor(private readonly deps: SchedulingSuggestionServiceDeps) {}

  /**
   * Registra uma sugestao assistiva de agendamento no ai_action_log com status
   * pending. NAO cria/altera agendamento — a confirmacao humana e um passo
   * separado (feito pelo smart-scheduling apos aprovacao). Requer
   * frontdesk:manage.
   */
  async suggest(actor: TenantContext, input: SuggestionInput): Promise<AIActionLog> {
    this.deps.authorization.ensure(actor, "frontdesk:manage", actor.tenantId);

    const conversation = await this.deps.conversations.findById(
      actor.tenantId,
      input.conversationId,
    );
    if (!conversation) {
      throw new NotFoundError("Conversa nao encontrada.");
    }

    const log = await this.deps.actionLogs.create({
      tenantId: actor.tenantId,
      conversationId: input.conversationId,
      actionType: "scheduling_suggestion",
      payload: { suggestedSlots: input.suggestedSlots },
      reviewStatus: "pending",
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai_action.scheduling_suggestion",
      resourceType: "ai_action_log",
      resourceId: log.id,
    });

    return log;
  }

  /**
   * Lista acoes de IA de uma conversa. Requer frontdesk:read.
   */
  async listActions(
    actor: TenantContext,
    conversationId: ConversationId,
  ): Promise<AIActionLog[]> {
    this.deps.authorization.ensure(actor, "frontdesk:read", actor.tenantId);
    return this.deps.actionLogs.listForConversation(actor.tenantId, conversationId);
  }

  /**
   * Aprova ou rejeita uma acao de IA. Revisao humana obrigatoria. Requer
   * frontdesk:manage.
   */
  async review(
    actor: TenantContext,
    actionId: string,
    decision: "approved" | "rejected",
  ): Promise<void> {
    this.deps.authorization.ensure(actor, "frontdesk:manage", actor.tenantId);
    await this.deps.actionLogs.setReviewStatus(
      actor.tenantId,
      actionId,
      decision,
      actor.userId,
    );
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `ai_action.${decision}`,
      resourceType: "ai_action_log",
      resourceId: actionId,
    });
  }
}
