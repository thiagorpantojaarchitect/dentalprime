/**
 * SchedulingService: criar, reagendar, cancelar e mudar status de agendamentos.
 *
 * - Verifica conflito de horario com outros agendamentos ativos do provider.
 * - Impede overbooking (salvo politica explicita `allowOverbooking`).
 * - Registra historico de transicoes de status (auditavel).
 * - Publica eventos de agenda versionados.
 *
 * Ver `.kiro/specs/smart-scheduling/requirements.md` (Requisitos 2 e 4).
 */

import type { ClinicUnitId, TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  NotFoundError,
  ScheduleConflictError,
  ValidationError,
} from "../domain/errors.js";
import type {
  Appointment,
  AppointmentId,
  AppointmentStatus,
  PatientId,
  ProviderId,
  ResourceId,
} from "../domain/models.js";
import type {
  AppointmentRepository,
  ProviderRepository,
  StatusHistoryRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { appointmentEvent, type EventPublisher } from "./event-publisher.js";

export interface BookInput {
  readonly patientId: PatientId;
  readonly providerId: ProviderId;
  readonly unitId: ClinicUnitId;
  readonly resourceId?: ResourceId | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Permite marcar sobre horario ocupado (politica explicita da clinica). */
  readonly allowOverbooking?: boolean | undefined;
}

/** Transicoes de status validas. */
const ALLOWED_TRANSITIONS: Readonly<
  Record<AppointmentStatus, readonly AppointmentStatus[]>
> = {
  booked: ["confirmed", "cancelled", "no_show", "attended"],
  confirmed: ["attended", "no_show", "cancelled"],
  attended: [],
  no_show: [],
  cancelled: [],
};

export interface SchedulingServiceDeps {
  readonly appointments: AppointmentRepository;
  readonly providers: ProviderRepository;
  readonly statusHistory: StatusHistoryRepository;
  readonly audit: AuditService;
  readonly events: EventPublisher;
  readonly authorization: AuthorizationService;
}

export class SchedulingService {
  constructor(private readonly deps: SchedulingServiceDeps) {}

  /** Cria um agendamento verificando conflito. Requer appointment:manage. */
  async book(actor: TenantContext, input: BookInput): Promise<Appointment> {
    this.deps.authorization.ensure(actor, "appointment:manage", actor.tenantId);
    this.validateInterval(input.startsAt, input.endsAt);

    const provider = await this.deps.providers.findById(actor.tenantId, input.providerId);
    if (!provider) {
      throw new NotFoundError("Profissional nao encontrado.");
    }

    if (!input.allowOverbooking) {
      await this.assertNoConflict(
        actor.tenantId,
        input.providerId,
        input.startsAt,
        input.endsAt,
      );
    }

    const appointment = await this.deps.appointments.create({
      tenantId: actor.tenantId,
      unitId: input.unitId,
      patientId: input.patientId,
      providerId: input.providerId,
      resourceId: input.resourceId ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdBy: actor.userId,
    });

    await this.deps.statusHistory.append({
      tenantId: actor.tenantId,
      appointmentId: appointment.id,
      fromStatus: null,
      toStatus: "booked",
      changedBy: actor.userId,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "appointment.booked",
      resourceType: "appointment",
      resourceId: appointment.id,
    });

    await this.deps.events.publish(
      appointmentEvent("AppointmentBooked", actor.tenantId, {
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        providerId: appointment.providerId,
        startsAt: appointment.startsAt.toISOString(),
      }),
    );

    return appointment;
  }

  /** Reagenda um agendamento existente verificando conflito. Requer appointment:manage. */
  async reschedule(
    actor: TenantContext,
    appointmentId: AppointmentId,
    startsAt: Date,
    endsAt: Date,
    allowOverbooking = false,
  ): Promise<Appointment> {
    this.deps.authorization.ensure(actor, "appointment:manage", actor.tenantId);
    this.validateInterval(startsAt, endsAt);

    const current = await this.deps.appointments.findById(actor.tenantId, appointmentId);
    if (!current) {
      throw new NotFoundError("Agendamento nao encontrado.");
    }
    if (current.status === "cancelled" || current.status === "attended") {
      throw new ValidationError("Agendamento nao pode ser reagendado no status atual.");
    }

    if (!allowOverbooking) {
      await this.assertNoConflict(
        actor.tenantId,
        current.providerId,
        startsAt,
        endsAt,
        appointmentId,
      );
    }

    const updated = await this.deps.appointments.updateSchedule(
      actor.tenantId,
      appointmentId,
      startsAt,
      endsAt,
    );

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "appointment.rescheduled",
      resourceType: "appointment",
      resourceId: appointmentId,
    });

    return updated;
  }

  /**
   * Muda o status do agendamento validando a transicao. Registra historico,
   * audita e publica evento quando aplicavel.
   */
  async changeStatus(
    actor: TenantContext,
    appointmentId: AppointmentId,
    toStatus: AppointmentStatus,
  ): Promise<Appointment> {
    this.deps.authorization.ensure(actor, "appointment:manage", actor.tenantId);

    const current = await this.deps.appointments.findById(actor.tenantId, appointmentId);
    if (!current) {
      throw new NotFoundError("Agendamento nao encontrado.");
    }

    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(toStatus)) {
      throw new ValidationError(
        `Transicao de status invalida: ${current.status} -> ${toStatus}.`,
      );
    }

    const updated = await this.deps.appointments.updateStatus(
      actor.tenantId,
      appointmentId,
      toStatus,
    );

    await this.deps.statusHistory.append({
      tenantId: actor.tenantId,
      appointmentId,
      fromStatus: current.status,
      toStatus,
      changedBy: actor.userId,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `appointment.status.${toStatus}`,
      resourceType: "appointment",
      resourceId: appointmentId,
    });

    await this.publishStatusEvent(actor.tenantId, updated, toStatus);

    return updated;
  }

  /** Historico de transicoes de status. Requer appointment:read. */
  async statusHistoryFor(
    actor: TenantContext,
    appointmentId: AppointmentId,
  ): Promise<
    Array<{
      fromStatus: AppointmentStatus | null;
      toStatus: AppointmentStatus;
      changedBy: string;
      changedAt: Date;
    }>
  > {
    this.deps.authorization.ensure(actor, "appointment:read", actor.tenantId);
    return this.deps.statusHistory.listForAppointment(actor.tenantId, appointmentId);
  }

  private validateInterval(startsAt: Date, endsAt: Date): void {
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new ValidationError("Fim do agendamento deve ser posterior ao inicio.");
    }
  }

  private async assertNoConflict(
    tenantId: string,
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId?: AppointmentId,
  ): Promise<void> {
    const conflicts = await this.deps.appointments.listActiveForProviderInRange(
      tenantId,
      providerId,
      startsAt,
      endsAt,
    );
    const real = conflicts.filter((c) => c.id !== excludeAppointmentId);
    if (real.length > 0) {
      throw new ScheduleConflictError(
        "Ja existe um agendamento para este profissional no horario.",
      );
    }
  }

  private async publishStatusEvent(
    tenantId: string,
    appointment: Appointment,
    toStatus: AppointmentStatus,
  ): Promise<void> {
    const map: Partial<
      Record<
        AppointmentStatus,
        "AppointmentConfirmed" | "AppointmentCancelled" | "AppointmentNoShow"
      >
    > = {
      confirmed: "AppointmentConfirmed",
      cancelled: "AppointmentCancelled",
      no_show: "AppointmentNoShow",
    };
    const type = map[toStatus];
    if (!type) return;
    await this.deps.events.publish(
      appointmentEvent(type, tenantId, {
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        providerId: appointment.providerId,
        startsAt: appointment.startsAt.toISOString(),
      }),
    );
  }
}
