/**
 * Contratos de repositorio do ai-front-desk. Todo metodo recebe `tenantId`
 * explicitamente; a implementacao aplica o filtro por tenant em toda consulta.
 */

import type { TenantId, UserId } from "@dentalprime/core";

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
} from "./models.js";

export interface ConversationRepository {
  findById(tenantId: TenantId, id: ConversationId): Promise<Conversation | null>;
  create(input: {
    tenantId: TenantId;
    contactRef: string | null;
    channel: ConversationChannel;
  }): Promise<Conversation>;
  setStatus(
    tenantId: TenantId,
    id: ConversationId,
    status: ConversationStatus,
  ): Promise<void>;
}

export interface MessageRepository {
  add(input: {
    tenantId: TenantId;
    conversationId: ConversationId;
    role: MessageRole;
    isAI: boolean;
    content: string;
  }): Promise<Message>;
  listForConversation(tenantId: TenantId, id: ConversationId): Promise<Message[]>;
}

export interface HandoffRepository {
  create(input: {
    tenantId: TenantId;
    conversationId: ConversationId;
    reason: string;
    triggeredBy: HandoffTrigger;
  }): Promise<Handoff>;
}

export interface AIActionLogRepository {
  create(input: {
    tenantId: TenantId;
    conversationId: ConversationId;
    actionType: string;
    payload: Record<string, unknown> | null;
    reviewStatus: ReviewStatus;
  }): Promise<AIActionLog>;
  listForConversation(tenantId: TenantId, id: ConversationId): Promise<AIActionLog[]>;
  setReviewStatus(
    tenantId: TenantId,
    actionId: string,
    reviewStatus: ReviewStatus,
    reviewedByUserId: UserId,
  ): Promise<void>;
}

export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>;
}
