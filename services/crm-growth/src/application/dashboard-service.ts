/**
 * DashboardService: visao agregada e somente-leitura do funil de leads.
 *
 * Consolida os leads do tenant por status e deriva a taxa de conversao, para os
 * indicadores de captacao do gerente de rede e da proprietaria (ver personas em
 * `.kiro/steering/product-vision.md`).
 *
 * - Somente leitura: nao altera nenhum dado.
 * - Isolado por tenant: a agregacao filtra por `tenantId`.
 * - Auditoria: o acesso ao painel e registrado.
 * - Requer `crm:read`.
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import type { LeadStatus } from "../domain/models.js";
import type { LeadRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface LeadStatusBucket {
  readonly status: LeadStatus;
  readonly count: number;
}

export interface CrmDashboard {
  /** Funil por status (new, contacted, qualified, converted, lost). */
  readonly funnel: readonly LeadStatusBucket[];
  /** Total de leads do tenant. */
  readonly totalLeads: number;
  /**
   * Taxa de conversao (converted / total), em [0,1]. `null` quando nao ha leads.
   */
  readonly conversionRate: number | null;
}

export interface DashboardServiceDeps {
  readonly leads: LeadRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

/** Ordem estavel do funil (etapas do lead ate a conversao / perda). */
const FUNNEL_ORDER: readonly LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
];

export class DashboardService {
  constructor(private readonly deps: DashboardServiceDeps) {}

  /** Retorna o funil de leads agregado do tenant. Requer crm:read. */
  async leadFunnel(actor: TenantContext): Promise<CrmDashboard> {
    this.deps.authorization.ensure(actor, "crm:read", actor.tenantId);

    const counts = await this.deps.leads.countByStatus(actor.tenantId);
    const map = new Map(counts.map((c) => [c.status, c.count]));

    const funnel: LeadStatusBucket[] = FUNNEL_ORDER.map((status) => ({
      status,
      count: map.get(status) ?? 0,
    }));

    const totalLeads = funnel.reduce((acc, b) => acc + b.count, 0);
    const converted = map.get("converted") ?? 0;
    const conversionRate = totalLeads === 0 ? null : converted / totalLeads;

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "crm.dashboard_viewed",
      resourceType: "crm_dashboard",
      resourceId: null,
    });

    return { funnel, totalLeads, conversionRate };
  }
}
