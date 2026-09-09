/**
 * Implementacoes Drizzle dos repositorios do ai-front-desk, com isolamento por
 * tenant. Cada consulta filtra por `tenantId`.
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { and, eq } from "drizzle-orm";

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
import type { Database } from "./db/client.js";
import {
  aiActionLogs,
  auditLogs,
  conversations,
  handoffs,
  messages,
} from "./db/schema.js";

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, id: ConversationId): Promise<Conversation | null> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.id, id)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      contactRef: row.contactRef,
      channel: row.channel,
      status: row.status,
    };
  }

  async create(input: {
    tenantId: TenantId;
    contactRef: string | null;
    channel: ConversationChannel;
  }): Promise<Conversation> {
    const rows = await this.db.insert(conversations).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      contactRef: row.contactRef,
      channel: row.channel,
      status: row.status,
    };
  }

  async setStatus(
    tenantId: TenantId,
    id: ConversationId,
    status: ConversationStatus,
  ): Promise<void> {
    await this.db
      .update(conversations)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.id, id)));
  }
}

export class DrizzleMessageRepository implements MessageRepository {
  constructor(private readonly db: Database) {}

  async add(input: {
    tenantId: TenantId;
    conversationId: ConversationId;
    role: MessageRole;
    isAI: boolean;
    content: string;
  }): Promise<Message> {
    const rows = await this.db.insert(messages).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      conversationId: row.conversationId,
      role: row.role,
      isAI: row.isAI,
      content: row.content,
      createdAt: row.createdAt,
    };
  }

  async listForConversation(tenantId: TenantId, id: ConversationId): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.tenantId, tenantId), eq(messages.conversationId, id)))
      .orderBy(messages.createdAt);
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      conversationId: row.conversationId,
      role: row.role,
      isAI: row.isAI,
      content: row.content,
      createdAt: row.createdAt,
    }));
  }
}

export class DrizzleHandoffRepository implements HandoffRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    conversationId: ConversationId;
    reason: string;
    triggeredBy: HandoffTrigger;
  }): Promise<Handoff> {
    const rows = await this.db.insert(handoffs).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      conversationId: row.conversationId,
      reason: row.reason,
      triggeredBy: row.triggeredBy,
    };
  }
}

export class DrizzleAIActionLogRepository implements AIActionLogRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    conversationId: ConversationId;
    actionType: string;
    payload: Record<string, unknown> | null;
    reviewStatus: ReviewStatus;
  }): Promise<AIActionLog> {
    const rows = await this.db.insert(aiActionLogs).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      conversationId: row.conversationId,
      actionType: row.actionType,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
      reviewStatus: row.reviewStatus,
    };
  }

  async listForConversation(
    tenantId: TenantId,
    id: ConversationId,
  ): Promise<AIActionLog[]> {
    const rows = await this.db
      .select()
      .from(aiActionLogs)
      .where(
        and(eq(aiActionLogs.tenantId, tenantId), eq(aiActionLogs.conversationId, id)),
      );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      conversationId: row.conversationId,
      actionType: row.actionType,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
      reviewStatus: row.reviewStatus,
    }));
  }

  async setReviewStatus(
    tenantId: TenantId,
    actionId: string,
    reviewStatus: ReviewStatus,
    reviewedByUserId: UserId,
  ): Promise<void> {
    await this.db
      .update(aiActionLogs)
      .set({ reviewStatus, reviewedByUserId })
      .where(and(eq(aiActionLogs.tenantId, tenantId), eq(aiActionLogs.id, actionId)));
  }
}

export class DrizzleAuditRepository implements AuditRepository {
  constructor(private readonly db: Database) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLogs).values({
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      ipAddress: entry.ipAddress,
    });
  }
}
