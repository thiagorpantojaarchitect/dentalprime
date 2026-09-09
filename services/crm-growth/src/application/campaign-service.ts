/**
 * CampaignService: campanhas de captacao/reativacao.
 * SegmentService: definicao de segmentos.
 *
 * Ao selecionar o publico de uma campanha, filtra por elegibilidade
 * (ConsentService): apenas contatos com opt-in vigente para a finalidade/canal
 * entram. A decisao (incluido/excluido) e auditada. O envio em si e assincrono
 * e fora deste servico.
 *
 * Ver `.kiro/specs/crm-growth/requirements.md` (Requisitos 3, 4 e 5).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { Campaign, CampaignId, Channel, Segment } from "../domain/models.js";
import type { CampaignRepository, SegmentRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import type { ConsentService } from "./consent-service.js";

export interface CreateCampaignInput {
  readonly name: string;
  readonly purpose: string;
  readonly channel: Channel;
  readonly startsAt?: Date | null;
  readonly endsAt?: Date | null;
}

export interface CampaignServiceDeps {
  readonly campaigns: CampaignRepository;
  readonly consent: ConsentService;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export interface AudienceResult {
  readonly eligible: readonly string[];
  readonly excluded: readonly string[];
}

export class CampaignService {
  constructor(private readonly deps: CampaignServiceDeps) {}

  /** Cria uma campanha. Requer crm:manage. */
  async create(actor: TenantContext, input: CreateCampaignInput): Promise<Campaign> {
    this.deps.authorization.ensure(actor, "crm:manage", actor.tenantId);
    if (!input.name.trim()) {
      throw new ValidationError("Nome da campanha e obrigatorio.");
    }
    const campaign = await this.deps.campaigns.create({
      tenantId: actor.tenantId,
      name: input.name.trim(),
      purpose: input.purpose,
      channel: input.channel,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "campaign.created",
      resourceType: "campaign",
      resourceId: campaign.id,
    });
    return campaign;
  }

  /**
   * Seleciona o publico elegivel de uma campanha a partir de uma lista de
   * candidatos (contactRefs). Filtra por consentimento/opt-out. Requer
   * crm:manage. Retorna os elegiveis e os excluidos, e audita a decisao.
   */
  async selectAudience(
    actor: TenantContext,
    campaignId: CampaignId,
    candidateContactRefs: readonly string[],
  ): Promise<AudienceResult> {
    this.deps.authorization.ensure(actor, "crm:manage", actor.tenantId);

    const campaign = await this.deps.campaigns.findById(actor.tenantId, campaignId);
    if (!campaign) {
      throw new NotFoundError("Campanha nao encontrada.");
    }

    const eligible: string[] = [];
    const excluded: string[] = [];
    for (const contactRef of candidateContactRefs) {
      const ok = await this.deps.consent.isEligible(
        actor.tenantId,
        contactRef,
        campaign.purpose,
        campaign.channel,
      );
      if (ok) {
        eligible.push(contactRef);
      } else {
        excluded.push(contactRef);
      }
    }

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "campaign.audience_selected",
      resourceType: "campaign",
      resourceId: campaignId,
      metadata: { eligibleCount: eligible.length, excludedCount: excluded.length },
    });

    return { eligible, excluded };
  }
}

export interface SegmentServiceDeps {
  readonly segments: SegmentRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class SegmentService {
  constructor(private readonly deps: SegmentServiceDeps) {}

  /** Cria um segmento com criterios. Requer crm:manage. */
  async create(
    actor: TenantContext,
    name: string,
    criteria: Record<string, unknown>,
  ): Promise<Segment> {
    this.deps.authorization.ensure(actor, "crm:manage", actor.tenantId);
    if (!name.trim()) {
      throw new ValidationError("Nome do segmento e obrigatorio.");
    }
    const segment = await this.deps.segments.create({
      tenantId: actor.tenantId,
      name: name.trim(),
      criteria,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "segment.created",
      resourceType: "segment",
      resourceId: segment.id,
    });
    return segment;
  }
}
