/**
 * DashboardService: visao agregada e somente-leitura da agenda do tenant.
 *
 * Consolida os agendamentos por status em uma janela de datas e deriva
 * indicadores de operacao (comparecimento, faltas) para a recepcao e a gestao
 * (ver personas em `.kiro/steering/product-vision.md`).
 *
 * - Somente leitura: nao altera nenhum dado.
 * - Isolado por tenant: a agregacao filtra por `tenantId`.
 * - Auditoria: o acesso ao painel e registrado.
 * - Requer `appointment:read`.
 */

import type { ClinicUnitId, TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { ValidationError } from "../domain/errors.js";
import type { AppointmentStatus } from "../domain/models.js";
import type { AppointmentRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface AppointmentStatusBucket {
  readonly status: AppointmentStatus;
  readonly count: number;
}

export interface SchedulingDashboard {
  readonly from: string;
  readonly to: string;
  /** Contagem por status (booked, confirmed, attended, no_show, cancelled). */
  readonly byStatus: readonly AppointmentStatusBucket[];
  /** Total de agendamentos na janela. */
  readonly total: number;
  /**
   * Taxa de nao comparecimento (no_show / (attended + no_show)), em [0,1].
   * Considera apenas agendamentos com desfecho conhecido (compareceu ou faltou).
   * `null` quando nao ha desfechos no periodo.
   */
  readonly noShowRate: number | null;
  /** Taxa de comparecimento (attended / (attended + no_show)), em [0,1]. */
  readonly attendanceRate: number | null;
}

export interface DashboardServiceDeps {
  readonly appointments: AppointmentRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

/** Ordem estavel dos status na resposta. */
const STATUS_ORDER: readonly AppointmentStatus[] = [
  "booked",
  "confirmed",
  "attended",
  "no_show",
  "cancelled",
];

export class DashboardService {
  constructor(private readonly deps: DashboardServiceDeps) {}

  /**
   * Painel da agenda em uma janela [from, to). Requer appointment:read.
   * Lanca ValidationError se o intervalo for invalido (from >= to).
   */
  async schedulingSummary(
    actor: TenantContext,
    from: Date,
    to: Date,
    unitId?: ClinicUnitId,
  ): Promise<SchedulingDashboard> {
    if (unitId) {
      this.deps.authorization.ensureUnit(
        actor,
        "appointment:read",
        actor.tenantId,
        unitId,
      );
    } else {
      this.deps.authorization.ensure(actor, "appointment:read", actor.tenantId);
    }

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime()
    ) {
      throw new ValidationError("Intervalo de datas invalido.");
    }

    const summary = await this.deps.appointments.summarizeByStatusInRange(
      actor.tenantId,
      from,
      to,
      unitId ? [unitId] : actor.units.length > 0 ? actor.units : undefined,
    );
    const map = new Map(summary.map((s) => [s.status, s.count]));

    const byStatus: AppointmentStatusBucket[] = STATUS_ORDER.map((status) => ({
      status,
      count: map.get(status) ?? 0,
    }));

    const total = byStatus.reduce((acc, b) => acc + b.count, 0);
    const attended = map.get("attended") ?? 0;
    const noShow = map.get("no_show") ?? 0;
    const withOutcome = attended + noShow;
    const noShowRate = withOutcome === 0 ? null : noShow / withOutcome;
    const attendanceRate = withOutcome === 0 ? null : attended / withOutcome;

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "scheduling.dashboard_viewed",
      resourceType: "scheduling_dashboard",
      resourceId: unitId ?? null,
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      byStatus,
      total,
      noShowRate,
      attendanceRate,
    };
  }
}
