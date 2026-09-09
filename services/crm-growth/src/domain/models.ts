/**
 * Modelos de dominio do crm-growth.
 */

import type { TenantId, UserId } from "@dentalprime/core";

export type LeadId = string;
export type CampaignId = string;
export type SegmentId = string;

export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
export type Channel = "phone" | "email" | "whatsapp" | "in_person";
export type ConsentDecision = "opt_in" | "opt_out";

export interface Lead {
  readonly id: LeadId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly source: string | null;
  readonly status: LeadStatus;
  readonly patientId: string | null;
}

export interface Interaction {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly leadId: LeadId | null;
  readonly patientId: string | null;
  readonly kind: string;
  readonly channel: Channel;
  readonly note: string | null;
  readonly authorUserId: UserId;
  readonly occurredAt: Date;
}

export interface Campaign {
  readonly id: CampaignId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly purpose: string;
  readonly channel: Channel;
}

export interface Segment {
  readonly id: SegmentId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly criteria: Record<string, unknown>;
}

export interface ContactConsent {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly contactRef: string;
  readonly purpose: string;
  readonly channel: Channel;
  readonly decision: ConsentDecision;
  readonly recordedAt: Date;
}

export interface AuditEntry {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly ipAddress: string | null;
}

/** Transicoes validas de status de lead. */
export const LEAD_TRANSITIONS: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  new: ["contacted", "lost"],
  contacted: ["qualified", "lost"],
  qualified: ["converted", "lost"],
  converted: [],
  lost: [],
};
