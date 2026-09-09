/**
 * Contratos de repositorio do crm-growth. Todo metodo recebe `tenantId`
 * explicitamente; a implementacao aplica o filtro por tenant em toda consulta.
 */

import type { TenantId, UserId } from "@dentalprime/core";

import type {
  AuditEntry,
  Campaign,
  CampaignId,
  Channel,
  ConsentDecision,
  ContactConsent,
  Interaction,
  Lead,
  LeadId,
  LeadStatus,
  Segment,
  SegmentId,
} from "./models.js";

export interface LeadRepository {
  findById(tenantId: TenantId, leadId: LeadId): Promise<Lead | null>;
  create(input: {
    tenantId: TenantId;
    name: string;
    email: string | null;
    phone: string | null;
    source: string | null;
  }): Promise<Lead>;
  update(
    tenantId: TenantId,
    leadId: LeadId,
    changes: { status?: LeadStatus; patientId?: string | null },
  ): Promise<Lead>;
  listByStatus(tenantId: TenantId, status: LeadStatus): Promise<Lead[]>;
}

export interface InteractionRepository {
  create(input: {
    tenantId: TenantId;
    leadId: LeadId | null;
    patientId: string | null;
    kind: string;
    channel: Channel;
    note: string | null;
    authorUserId: UserId;
  }): Promise<Interaction>;
  listForLead(tenantId: TenantId, leadId: LeadId): Promise<Interaction[]>;
}

export interface CampaignRepository {
  create(input: {
    tenantId: TenantId;
    name: string;
    purpose: string;
    channel: Channel;
    startsAt: Date | null;
    endsAt: Date | null;
  }): Promise<Campaign>;
  findById(tenantId: TenantId, campaignId: CampaignId): Promise<Campaign | null>;
}

export interface SegmentRepository {
  create(input: {
    tenantId: TenantId;
    name: string;
    criteria: Record<string, unknown>;
  }): Promise<Segment>;
  findById(tenantId: TenantId, segmentId: SegmentId): Promise<Segment | null>;
}

export interface ConsentRepository {
  /** Ultima decisao para (contato, finalidade, canal). */
  latest(
    tenantId: TenantId,
    contactRef: string,
    purpose: string,
    channel: Channel,
  ): Promise<ContactConsent | null>;
  record(input: {
    tenantId: TenantId;
    contactRef: string;
    purpose: string;
    channel: Channel;
    decision: ConsentDecision;
  }): Promise<ContactConsent>;
}

export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>;
}
