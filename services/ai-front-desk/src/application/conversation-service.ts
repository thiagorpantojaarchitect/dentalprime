/**
 * ConversationService: recepcao por IA assistiva.
 *
 * - Inicia conversas e registra mensagens (contato / IA / agente humano).
 * - Toda mensagem de IA e marcada `isAI = true` (identificacao ao usuario).
 * - Guardrail: se o contato pede conteudo clinico (diagnostico/prescricao), a IA
 *   NAO responde clinicamente; registra uma mensagem de recusa e cria um handoff
 *   para um profissional. Nenhuma decisao clinica autonoma.
 * - Triagem nao clinica; urgencia recomenda handoff.
 *
 * Ver `.kiro/specs/ai-front-desk/requirements.md` e
 * `.kiro/steering/clinical-safety.md`.
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError } from "../domain/errors.js";
import { requestsClinicalContent } from "../domain/guardrails.js";
import type {
  Conversation,
  ConversationChannel,
  ConversationId,
  Message,
  TriageResult,
} from "../domain/models.js";
import type {
  ConversationRepository,
  HandoffRepository,
  MessageRepository,
} from "../domain/repositories.js";
import type { AIProvider } from "./ai-provider.js";
import type { AuditService } from "./audit-service.js";

export interface ConversationServiceDeps {
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly handoffs: HandoffRepository;
  readonly ai: AIProvider;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export interface ContactMessageResult {
  readonly reply: Message;
  /** Verdadeiro quando o guardrail bloqueou conteudo clinico e gerou handoff. */
  readonly handedOff: boolean;
}

export class ConversationService {
  constructor(private readonly deps: ConversationServiceDeps) {}

  /** Inicia uma conversa. Requer frontdesk:manage. */
  async start(
    actor: TenantContext,
    channel: ConversationChannel,
    contactRef: string | null,
  ): Promise<Conversation> {
    this.deps.authorization.ensure(actor, "frontdesk:manage", actor.tenantId);
    const conversation = await this.deps.conversations.create({
      tenantId: actor.tenantId,
      contactRef,
      channel,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "conversation.started",
      resourceType: "conversation",
      resourceId: conversation.id,
    });
    return conversation;
  }

  /**
   * Processa uma mensagem do contato: registra a mensagem, aplica o guardrail
   * clinico e, se seguro, gera a resposta assistiva da IA (marcada isAI). Se o
   * conteudo for clinico, recusa e cria handoff. Requer frontdesk:manage.
   */
  async handleContactMessage(
    actor: TenantContext,
    conversationId: ConversationId,
    content: string,
  ): Promise<ContactMessageResult> {
    this.deps.authorization.ensure(actor, "frontdesk:manage", actor.tenantId);

    const conversation = await this.deps.conversations.findById(
      actor.tenantId,
      conversationId,
    );
    if (!conversation) {
      throw new NotFoundError("Conversa nao encontrada.");
    }

    // Registra a mensagem do contato.
    await this.deps.messages.add({
      tenantId: actor.tenantId,
      conversationId,
      role: "contact",
      isAI: false,
      content,
    });

    // Guardrail de seguranca clinica: pedido de diagnostico/prescricao.
    if (requestsClinicalContent(content)) {
      const refusal = await this.deps.messages.add({
        tenantId: actor.tenantId,
        conversationId,
        role: "ai",
        isAI: true,
        content:
          "Nao posso fornecer diagnostico ou prescricao. Vou encaminhar voce a " +
          "um profissional da clinica.",
      });
      await this.deps.handoffs.create({
        tenantId: actor.tenantId,
        conversationId,
        reason: "clinical_content_requested",
        triggeredBy: "ai",
      });
      await this.deps.conversations.setStatus(actor.tenantId, conversationId, "handoff");
      await this.deps.audit.record({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "conversation.clinical_content_blocked",
        resourceType: "conversation",
        resourceId: conversationId,
      });
      return { reply: refusal, handedOff: true };
    }

    // Conteudo seguro: resposta assistiva da IA (identificada).
    const aiText = await this.deps.ai.reply(content);
    const reply = await this.deps.messages.add({
      tenantId: actor.tenantId,
      conversationId,
      role: "ai",
      isAI: true,
      content: aiText,
    });
    return { reply, handedOff: false };
  }

  /** Triagem nao clinica do texto. Requer frontdesk:manage. */
  async triage(actor: TenantContext, text: string): Promise<TriageResult> {
    this.deps.authorization.ensure(actor, "frontdesk:manage", actor.tenantId);
    return this.deps.ai.triage(text);
  }

  /** Lista as mensagens de uma conversa. Requer frontdesk:read. */
  async listMessages(
    actor: TenantContext,
    conversationId: ConversationId,
  ): Promise<Message[]> {
    this.deps.authorization.ensure(actor, "frontdesk:read", actor.tenantId);
    return this.deps.messages.listForConversation(actor.tenantId, conversationId);
  }
}
