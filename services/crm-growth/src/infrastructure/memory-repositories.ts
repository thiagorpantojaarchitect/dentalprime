/**
 * Implementacoes em memoria dos repositorios, para testes. Respeitam o
 * isolamento por tenant e a semantica de "ultima decisao" de consentimento.
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { randomUUID } from "node:crypto";

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
} from "../domain/models.js";
import type {
  AuditRepository,
  CampaignRepository,
  ConsentRepository,
  InteractionRepository,
  LeadRepository,
  SegmentRepository,
} from "../domain/repositories.js";

export class InMemoryLeadRepository implements LeadRepository {
  private readonly rows = new Map<string, Lead>();

  async findById(tenantId: TenantId, leadId: LeadId): Promise<Lead | null> {
    const l = this.rows.get(leadId);
    return l && l.tenantId === tenantId ? l : null;
  }

  async create(input: {
    tenantId: TenantId;
    name: string;
    email: string | null;
    phone: string | null;
    source: string | null;
  }): Promise<Lead> {
    const lead: Lead = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      source: input.source,
      status: "new",
      patientId: null,
    };
    this.rows.set(lead.id, lead);
    return lead;
  }

  async update(
    tenantId: TenantId,
    leadId: LeadId,
    changes: { status?: LeadStatus; patientId?: string | null },
  ): Promise<Lead> {
    const current = await this.findById(tenantId, leadId);
    if (!current) throw new Error("lead nao encontrado");
    const updated: Lead = {
      ...current,
      status: changes.status ?? current.status,
      patientId: changes.patientId !== undefined ? changes.patientId : current.patientId,
    };
    this.rows.set(leadId, updated);
    return updated;
  }

  async listByStatus(tenantId: TenantId, status: LeadStatus): Promise<Lead[]> {
    return [...this.rows.values()].filter(
      (l) => l.tenantId === tenantId && l.status === status,
    );
  }
}

export class InMemoryInteractionRepository implements InteractionRepository {
  private readonly rows: Interaction[] = [];

  async create(input: {
    tenantId: TenantId;
    leadId: LeadId | null;
    patientId: string | null;
    kind: string;
    channel: Channel;
    note: string | null;
    authorUserId: UserId;
  }): Promise<Interaction> {
    const interaction: Interaction = {
      id: randomUUID(),
      tenantId: input.tenantId,
      leadId: input.leadId,
      patientId: input.patientId,
      kind: input.kind,
      channel: input.channel,
      note: input.note,
      authorUserId: input.authorUserId,
      occurredAt: new Date(),
    };
    this.rows.push(interaction);
    return interaction;
  }

  async listForLead(tenantId: TenantId, leadId: LeadId): Promise<Interaction[]> {
    return this.rows
      .filter((i) => i.tenantId === tenantId && i.leadId === leadId)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }
}

export class InMemoryCampaignRepository implements CampaignRepository {
  private readonly rows = new Map<string, Campaign>();

  async create(input: {
    tenantId: TenantId;
    name: string;
    purpose: string;
    channel: Channel;
    startsAt: Date | null;
    endsAt: Date | null;
  }): Promise<Campaign> {
    const campaign: Campaign = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      purpose: input.purpose,
      channel: input.channel,
    };
    this.rows.set(campaign.id, campaign);
    return campaign;
  }

  async findById(tenantId: TenantId, campaignId: CampaignId): Promise<Campaign | null> {
    const c = this.rows.get(campaignId);
    return c && c.tenantId === tenantId ? c : null;
  }
}

export class InMemorySegmentRepository implements SegmentRepository {
  private readonly rows = new Map<string, Segment>();

  async create(input: {
    tenantId: TenantId;
    name: string;
    criteria: Record<string, unknown>;
  }): Promise<Segment> {
    const segment: Segment = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      criteria: input.criteria,
    };
    this.rows.set(segment.id, segment);
    return segment;
  }

  async findById(tenantId: TenantId, segmentId: SegmentId): Promise<Segment | null> {
    const s = this.rows.get(segmentId);
    return s && s.tenantId === tenantId ? s : null;
  }
}

export class InMemoryConsentRepository implements ConsentRepository {
  private readonly rows: ContactConsent[] = [];

  async latest(
    tenantId: TenantId,
    contactRef: string,
    purpose: string,
    channel: Channel,
  ): Promise<ContactConsent | null> {
    // Percorre do fim (ordem de insercao = cronologica) para desempate estavel.
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const c = this.rows[i]!;
      if (
        c.tenantId === tenantId &&
        c.contactRef === contactRef &&
        c.purpose === purpose &&
        c.channel === channel
      ) {
        return c;
      }
    }
    return null;
  }

  async record(input: {
    tenantId: TenantId;
    contactRef: string;
    purpose: string;
    channel: Channel;
    decision: ConsentDecision;
  }): Promise<ContactConsent> {
    const consent: ContactConsent = {
      id: randomUUID(),
      tenantId: input.tenantId,
      contactRef: input.contactRef,
      purpose: input.purpose,
      channel: input.channel,
      decision: input.decision,
      recordedAt: new Date(),
    };
    this.rows.push(consent);
    return consent;
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  public readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
