/**
 * Implementacoes em memoria dos repositorios, para testes. Respeitam o
 * isolamento por tenant.
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { randomUUID } from "node:crypto";

import type {
  AIActionLog,
  AuditEntry,
  Conversation,
  ConversationChannel,
  ConversationId,
  ConversationStatus,
  Handoff,
  HandoffTrigger,
  Message,
  MessageRole,
  ReviewStatus,
} from "../domain/models.js";
import type {
  AIActionLogRepository,
  AuditRepository,
  ConversationRepository,
  HandoffRepository,
  MessageRepository,
} from "../domain/repositories.js";

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly rows = new Map<string, Conversation>();

  async findById(tenantId: TenantId, id: ConversationId): Promise<Conversation | null> {
    const c = this.rows.get(id);
    return c && c.tenantId === tenantId ? c : null;
  }

  async create(input: {
    tenantId: TenantId;
    contactRef: string | null;
    channel: ConversationChannel;
  }): Promise<Conversation> {
    const conversation: Conversation = {
      id: randomUUID(),
      tenantId: input.tenantId,
      contactRef: input.contactRef,
      channel: input.channel,
      status: "open",
    };
    this.rows.set(conversation.id, conversation);
    return conversation;
  }

  async setStatus(
    tenantId: TenantId,
    id: ConversationId,
    status: ConversationStatus,
  ): Promise<void> {
    const c = await this.findById(tenantId, id);
    if (c) this.rows.set(id, { ...c, status });
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  private readonly rows: Message[] = [];

  async add(input: {
    tenantId: TenantId;
    conversationId: ConversationId;
    role: MessageRole;
    isAI: boolean;
    content: string;
  }): Promise<Message> {
    const message: Message = {
      id: randomUUID(),
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      role: input.role,
      isAI: input.isAI,
      content: input.content,
      createdAt: new Date(),
    };
    this.rows.push(message);
    return message;
  }

  async listForConversation(tenantId: TenantId, id: ConversationId): Promise<Message[]> {
    return this.rows
      .filter((m) => m.tenantId === tenantId && m.conversationId === id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export class InMemoryHandoffRepository implements HandoffRepository {
  public readonly rows: Handoff[] = [];

  async create(input: {
    tenantId: TenantId;
    conversationId: ConversationId;
    reason: string;
    triggeredBy: HandoffTrigger;
  }): Promise<Handoff> {
    const handoff: Handoff = { id: randomUUID(), ...input };
    this.rows.push(handoff);
    return handoff;
  }
}

export class InMemoryAIActionLogRepository implements AIActionLogRepository {
  private readonly rows = new Map<
    string,
    AIActionLog & { reviewedByUserId: UserId | null }
  >();

  async create(input: {
    tenantId: TenantId;
    conversationId: ConversationId;
    actionType: string;
    payload: Record<string, unknown> | null;
    reviewStatus: ReviewStatus;
  }): Promise<AIActionLog> {
    const log: AIActionLog & { reviewedByUserId: UserId | null } = {
      id: randomUUID(),
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      actionType: input.actionType,
      payload: input.payload,
      reviewStatus: input.reviewStatus,
      reviewedByUserId: null,
    };
    this.rows.set(log.id, log);
    return log;
  }

  async listForConversation(
    tenantId: TenantId,
    id: ConversationId,
  ): Promise<AIActionLog[]> {
    return [...this.rows.values()].filter(
      (l) => l.tenantId === tenantId && l.conversationId === id,
    );
  }

  async setReviewStatus(
    tenantId: TenantId,
    actionId: string,
    reviewStatus: ReviewStatus,
    reviewedByUserId: UserId,
  ): Promise<void> {
    const l = this.rows.get(actionId);
    if (l && l.tenantId === tenantId) {
      this.rows.set(actionId, { ...l, reviewStatus, reviewedByUserId });
    }
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  public readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
