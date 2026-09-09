/**
 * LeadService: cadastro, mudanca de status e conversao de leads.
 * InteractionService: registro e listagem de interacoes.
 *
 * Transicoes de status validadas por LEAD_TRANSITIONS. Conversao vincula o lead
 * a um paciente. Tudo auditado. Ver `.kiro/specs/crm-growth/requirements.md`
 * (Requisitos 1 e 2).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import {
  LEAD_TRANSITIONS,
  type Channel,
  type Interaction,
  type Lead,
  type LeadId,
  type LeadStatus,
} from "../domain/models.js";
import type { InteractionRepository, LeadRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface CreateLeadInput {
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly source?: string | null;
}

export interface LeadServiceDeps {
  readonly leads: LeadRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class LeadService {
  constructor(private readonly deps: LeadServiceDeps) {}

  /** Cadastra um lead (status new). Requer crm:manage. */
  async create(actor: TenantContext, input: CreateLeadInput): Promise<Lead> {
    this.deps.authorization.ensure(actor, "crm:manage", actor.tenantId);
    if (!input.name.trim()) {
      throw new ValidationError("Nome do lead e obrigatorio.");
    }
    const lead = await this.deps.leads.create({
      tenantId: actor.tenantId,
      name: input.name.trim(),
      email: input.email ?? null,
      phone: input.phone ?? null,
      source: input.source ?? null,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "lead.created",
      resourceType: "lead",
      resourceId: lead.id,
    });
    return lead;
  }

  /** Muda o status do lead validando a transicao. Requer crm:manage. */
  async changeStatus(
    actor: TenantContext,
    leadId: LeadId,
    toStatus: LeadStatus,
  ): Promise<Lead> {
    this.deps.authorization.ensure(actor, "crm:manage", actor.tenantId);
    const lead = await this.deps.leads.findById(actor.tenantId, leadId);
    if (!lead) {
      throw new NotFoundError("Lead nao encontrado.");
    }
    if (!LEAD_TRANSITIONS[lead.status].includes(toStatus)) {
      throw new ValidationError(
        `Transicao de status invalida: ${lead.status} -> ${toStatus}.`,
      );
    }
    const updated = await this.deps.leads.update(actor.tenantId, leadId, {
      status: toStatus,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `lead.status.${toStatus}`,
      resourceType: "lead",
      resourceId: leadId,
    });
    return updated;
  }

  /**
   * Converte um lead em paciente (status converted + vinculo). O paciente ja
   * deve existir no patient-record; aqui apenas registramos o vinculo. Requer
   * crm:manage.
   */
  async convert(actor: TenantContext, leadId: LeadId, patientId: string): Promise<Lead> {
    this.deps.authorization.ensure(actor, "crm:manage", actor.tenantId);
    const lead = await this.deps.leads.findById(actor.tenantId, leadId);
    if (!lead) {
      throw new NotFoundError("Lead nao encontrado.");
    }
    if (!LEAD_TRANSITIONS[lead.status].includes("converted")) {
      throw new ValidationError(`Lead no status ${lead.status} nao pode ser convertido.`);
    }
    const updated = await this.deps.leads.update(actor.tenantId, leadId, {
      status: "converted",
      patientId,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "lead.converted",
      resourceType: "lead",
      resourceId: leadId,
      metadata: { patientId },
    });
    return updated;
  }
}

export interface RegisterInteractionInput {
  readonly leadId?: LeadId | null;
  readonly patientId?: string | null;
  readonly kind: string;
  readonly channel: Channel;
  readonly note?: string | null;
}

export interface InteractionServiceDeps {
  readonly interactions: InteractionRepository;
  readonly leads: LeadRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class InteractionService {
  constructor(private readonly deps: InteractionServiceDeps) {}

  /** Registra uma interacao com um lead ou paciente. Requer crm:manage. */
  async register(
    actor: TenantContext,
    input: RegisterInteractionInput,
  ): Promise<Interaction> {
    this.deps.authorization.ensure(actor, "crm:manage", actor.tenantId);
    if (!input.leadId && !input.patientId) {
      throw new ValidationError("Interacao deve referenciar um lead ou paciente.");
    }
    if (input.leadId) {
      const lead = await this.deps.leads.findById(actor.tenantId, input.leadId);
      if (!lead) {
        throw new NotFoundError("Lead nao encontrado.");
      }
    }
    const interaction = await this.deps.interactions.create({
      tenantId: actor.tenantId,
      leadId: input.leadId ?? null,
      patientId: input.patientId ?? null,
      kind: input.kind,
      channel: input.channel,
      note: input.note ?? null,
      authorUserId: actor.userId,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "interaction.registered",
      resourceType: "interaction",
      resourceId: interaction.id,
    });
    return interaction;
  }

  /** Lista interacoes de um lead. Requer crm:read. */
  async listForLead(actor: TenantContext, leadId: LeadId): Promise<Interaction[]> {
    this.deps.authorization.ensure(actor, "crm:read", actor.tenantId);
    return this.deps.interactions.listForLead(actor.tenantId, leadId);
  }
}
