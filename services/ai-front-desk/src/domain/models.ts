/**
 * Modelos de dominio do ai-front-desk.
 */

import type { TenantId, UserId } from "@dentalprime/core";

export type ConversationId = string;

export type ConversationChannel = "chat" | "whatsapp" | "voice" | "web";
export type ConversationStatus = "open" | "handoff" | "closed";
export type MessageRole = "contact" | "ai" | "human_agent";
export type HandoffTrigger = "contact" | "ai" | "rule";
export type ReviewStatus = "pending" | "approved" | "rejected" | "not_required";

export interface Conversation {
  readonly id: ConversationId;
  readonly tenantId: TenantId;
  readonly contactRef: string | null;
  readonly channel: ConversationChannel;
  readonly status: ConversationStatus;
}

export interface Message {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly conversationId: ConversationId;
  readonly role: MessageRole;
  readonly isAI: boolean;
  readonly content: string;
  readonly createdAt: Date;
}

export interface Handoff {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly conversationId: ConversationId;
  readonly reason: string;
  readonly triggeredBy: HandoffTrigger;
}

export interface AIActionLog {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly conversationId: ConversationId;
  readonly actionType: string;
  readonly payload: Record<string, unknown> | null;
  readonly reviewStatus: ReviewStatus;
}

export interface TriageResult {
  readonly reason: string;
  readonly perceivedUrgency: "low" | "medium" | "high";
  readonly recommendHandoff: boolean;
}

export interface AuditEntry {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly ipAddress: string | null;
}
