/**
 * DashboardService: visao agregada e somente-leitura do financeiro do tenant.
 *
 * Consolida faturas por status (contagem, total faturado e saldo a receber) e
 * expoe totais derivados para os indicadores da Dra. Marina e do gerente de rede
 * (ver personas em `.kiro/steering/product-vision.md`).
 *
 * - Somente leitura: nao altera nenhum dado.
 * - Isolado por tenant: a agregacao filtra por `tenantId`.
 * - Auditoria: o acesso ao painel financeiro e registrado (dado sensivel).
 * - Requer `finance:read`.
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import type { Cents } from "../domain/money.js";
import { sumCents } from "../domain/money.js";
import type { InvoiceStatus } from "../domain/models.js";
import type { InvoiceRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface InvoiceStatusBucket {
  readonly status: InvoiceStatus;
  readonly count: number;
  readonly amountCents: Cents;
  readonly balanceCents: Cents;
}

export interface FinanceDashboard {
  /** Agregado por status (open, partially_paid, paid, cancelled). */
  readonly byStatus: readonly InvoiceStatusBucket[];
  /** Numero total de faturas do tenant. */
  readonly totalInvoices: number;
  /** Total faturado, exceto faturas canceladas (em centavos). */
  readonly billedCents: Cents;
  /** Total ja recebido (faturado menos saldo), exceto canceladas (centavos). */
  readonly receivedCents: Cents;
  /** Total a receber (saldo em aberto), exceto canceladas (centavos). */
  readonly outstandingCents: Cents;
}

export interface DashboardServiceDeps {
  readonly invoices: InvoiceRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

/** Ordem estavel dos status na resposta (facilita consumo pelo front). */
const STATUS_ORDER: readonly InvoiceStatus[] = [
  "open",
  "partially_paid",
  "paid",
  "cancelled",
];

export class DashboardService {
  constructor(private readonly deps: DashboardServiceDeps) {}

  /** Retorna o painel financeiro agregado do tenant. Requer finance:read. */
  async financeSummary(actor: TenantContext): Promise<FinanceDashboard> {
    this.deps.authorization.ensure(actor, "finance:read", actor.tenantId);

    const summary = await this.deps.invoices.summarizeByStatus(actor.tenantId);
    const map = new Map(summary.map((s) => [s.status, s]));

    const byStatus: InvoiceStatusBucket[] = STATUS_ORDER.map((status) => {
      const row = map.get(status);
      return {
        status,
        count: row?.count ?? 0,
        amountCents: row?.amountCents ?? 0,
        balanceCents: row?.balanceCents ?? 0,
      };
    });

    const totalInvoices = sumCents(byStatus.map((b) => b.count));
    // Indicadores financeiros excluem faturas canceladas.
    const active = byStatus.filter((b) => b.status !== "cancelled");
    const billedCents = sumCents(active.map((b) => b.amountCents));
    const outstandingCents = sumCents(active.map((b) => b.balanceCents));
    const receivedCents = billedCents - outstandingCents;

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "finance.dashboard_viewed",
      resourceType: "finance_dashboard",
      resourceId: null,
    });

    return {
      byStatus,
      totalInvoices,
      billedCents,
      receivedCents,
      outstandingCents,
    };
  }
}
