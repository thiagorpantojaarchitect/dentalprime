/**
 * Implementacoes Drizzle dos repositorios do crm-growth, com isolamento por
 * tenant. Cada consulta filtra por `tenantId`.
 */

import type { TenantId, UserId } from "@dentalprime/core";
import { and, desc, eq } from "drizzle-orm";

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
import type { Database } from "./db/client.js";
import {
  auditLogs,
  campaigns,
  contactConsents,
  interactions,
  leads,
  segments,
} from "./db/schema.js";

function toLead(row: typeof leads.$inferSelect): Lead {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    patientId: row.patientId,
  };
}

export class DrizzleLeadRepository implements LeadRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, leadId: LeadId): Promise<Lead | null> {
    const rows = await this.db
      .select()
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
      .limit(1);
    return rows[0] ? toLead(rows[0]) : null;
  }

  async create(input: {
    tenantId: TenantId;
    name: string;
    email: string | null;
    phone: string | null;
    source: string | null;
  }): Promise<Lead> {
    const rows = await this.db.insert(leads).values(input).returning();
    return toLead(rows[0]!);
  }

  async update(
    tenantId: TenantId,
    leadId: LeadId,
    changes: { status?: LeadStatus; patientId?: string | null },
  ): Promise<Lead> {
    const set: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
    if (changes.status !== undefined) set.status = changes.status;
    if (changes.patientId !== undefined) set.patientId = changes.patientId;
    const rows = await this.db
      .update(leads)
      .set(set)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
      .returning();
    return toLead(rows[0]!);
  }

  async listByStatus(tenantId: TenantId, status: LeadStatus): Promise<Lead[]> {
    const rows = await this.db
      .select()
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.status, status)));
    return rows.map(toLead);
  }
}

export class DrizzleInteractionRepository implements InteractionRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    leadId: LeadId | null;
    patientId: string | null;
    kind: string;
    channel: Channel;
    note: string | null;
    authorUserId: UserId;
  }): Promise<Interaction> {
    const rows = await this.db.insert(interactions).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      leadId: row.leadId,
      patientId: row.patientId,
      kind: row.kind,
      channel: row.channel,
      note: row.note,
      authorUserId: row.authorUserId,
      occurredAt: row.occurredAt,
    };
  }

  async listForLead(tenantId: TenantId, leadId: LeadId): Promise<Interaction[]> {
    const rows = await this.db
      .select()
      .from(interactions)
      .where(and(eq(interactions.tenantId, tenantId), eq(interactions.leadId, leadId)))
      .orderBy(interactions.occurredAt);
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      leadId: row.leadId,
      patientId: row.patientId,
      kind: row.kind,
      channel: row.channel,
      note: row.note,
      authorUserId: row.authorUserId,
      occurredAt: row.occurredAt,
    }));
  }
}

export class DrizzleCampaignRepository implements CampaignRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    name: string;
    purpose: string;
    channel: Channel;
    startsAt: Date | null;
    endsAt: Date | null;
  }): Promise<Campaign> {
    const rows = await this.db.insert(campaigns).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      purpose: row.purpose,
      channel: row.channel,
    };
  }

  async findById(tenantId: TenantId, campaignId: CampaignId): Promise<Campaign | null> {
    const rows = await this.db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, campaignId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      purpose: row.purpose,
      channel: row.channel,
    };
  }
}

export class DrizzleSegmentRepository implements SegmentRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    name: string;
    criteria: Record<string, unknown>;
  }): Promise<Segment> {
    const rows = await this.db.insert(segments).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      criteria: row.criteria as Record<string, unknown>,
    };
  }

  async findById(tenantId: TenantId, segmentId: SegmentId): Promise<Segment | null> {
    const rows = await this.db
      .select()
      .from(segments)
      .where(and(eq(segments.tenantId, tenantId), eq(segments.id, segmentId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      criteria: row.criteria as Record<string, unknown>,
    };
  }
}

export class DrizzleConsentRepository implements ConsentRepository {
  constructor(private readonly db: Database) {}

  async latest(
    tenantId: TenantId,
    contactRef: string,
    purpose: string,
    channel: Channel,
  ): Promise<ContactConsent | null> {
    const rows = await this.db
      .select()
      .from(contactConsents)
      .where(
        and(
          eq(contactConsents.tenantId, tenantId),
          eq(contactConsents.contactRef, contactRef),
          eq(contactConsents.purpose, purpose),
          eq(contactConsents.channel, channel),
        ),
      )
      .orderBy(desc(contactConsents.recordedAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      contactRef: row.contactRef,
      purpose: row.purpose,
      channel: row.channel,
      decision: row.decision,
      recordedAt: row.recordedAt,
    };
  }

  async record(input: {
    tenantId: TenantId;
    contactRef: string;
    purpose: string;
    channel: Channel;
    decision: ConsentDecision;
  }): Promise<ContactConsent> {
    const rows = await this.db.insert(contactConsents).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      contactRef: row.contactRef,
      purpose: row.purpose,
      channel: row.channel,
      decision: row.decision,
      recordedAt: row.recordedAt,
    };
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
      metadata: entry.metadata,
      ipAddress: entry.ipAddress,
    });
  }
}
