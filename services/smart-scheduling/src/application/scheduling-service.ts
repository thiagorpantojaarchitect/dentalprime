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
  ResourceRepository,
  SchedulingUnitOfWork,
  StatusHistoryRepository,
} from "../domain/repositories.js";
import type { AvailabilityService } from "./availability-service.js";
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
  readonly resources: ResourceRepository;
  readonly availability: AvailabilityService;
  readonly statusHistory: StatusHistoryRepository;
  readonly unitOfWork: SchedulingUnitOfWork;
  readonly events: EventPublisher;
  readonly authorization: AuthorizationService;
}

export class SchedulingService {
  constructor(private readonly deps: SchedulingServiceDeps) {}

  /** Cria um agendamento verificando conflito. Requer appointment:manage. */
  async book(actor: TenantContext, input: BookInput): Promise<Appointment> {
    this.deps.authorization.ensureUnit(
      actor,
      "appointment:manage",
      actor.tenantId,
      input.unitId,
    );
    this.validateInterval(input.startsAt, input.endsAt);

    const resourceId = input.resourceId ?? null;
    await this.assertReferences(
      actor.tenantId,
      input.unitId,
      input.providerId,
      resourceId,
    );
    await this.assertAvailable(
      actor.tenantId,
      input.unitId,
      input.providerId,
      resourceId,
      input.startsAt,
      input.endsAt,
    );

    if (!input.allowOverbooking) {
      await this.assertNoConflict(
        actor.tenantId,
        input.providerId,
        resourceId,
        input.startsAt,
        input.endsAt,
      );
    }

    const appointment = await this.deps.unitOfWork.run(async (repositories) => {
      const created = await repositories.appointments.create({
        tenantId: actor.tenantId,
        unitId: input.unitId,
        patientId: input.patientId,
        providerId: input.providerId,
        resourceId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        allowOverbooking: input.allowOverbooking === true,
        createdBy: actor.userId,
      });
      await repositories.statusHistory.append({
        tenantId: actor.tenantId,
        appointmentId: created.id,
        fromStatus: null,
        toStatus: "booked",
        changedBy: actor.userId,
      });
      await repositories.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "appointment.booked",
        resourceType: "appointment",
        resourceId: created.id,
        ipAddress: null,
      });
      return created;
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
    this.deps.authorization.ensureUnit(
      actor,
      "appointment:manage",
      actor.tenantId,
      current.unitId,
    );
    if (current.status === "cancelled" || current.status === "attended") {
      throw new ValidationError("Agendamento nao pode ser reagendado no status atual.");
    }

    await this.assertReferences(
      actor.tenantId,
      current.unitId,
      current.providerId,
      current.resourceId,
    );
    await this.assertAvailable(
      actor.tenantId,
      current.unitId,
      current.providerId,
      current.resourceId,
      startsAt,
      endsAt,
    );

    if (!allowOverbooking) {
      await this.assertNoConflict(
        actor.tenantId,
        current.providerId,
        current.resourceId,
        startsAt,
        endsAt,
        appointmentId,
      );
    }

    const updated = await this.deps.unitOfWork.run(async (repositories) => {
      const latest = await repositories.appointments.findByIdForUpdate(
        actor.tenantId,
        appointmentId,
      );
      if (!latest) throw new NotFoundError("Agendamento nao encontrado.");
      if (latest.status === "cancelled" || latest.status === "attended") {
        throw new ValidationError("Agendamento nao pode ser reagendado no status atual.");
      }
      const rescheduled = await repositories.appointments.updateSchedule(
        actor.tenantId,
        appointmentId,
        startsAt,
        endsAt,
        allowOverbooking,
      );
      await repositories.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "appointment.rescheduled",
        resourceType: "appointment",
        resourceId: appointmentId,
        ipAddress: null,
      });
      return rescheduled;
    });

    await this.deps.events.publish(
      appointmentEvent("AppointmentRescheduled", actor.tenantId, {
        appointmentId: updated.id,
        patientId: updated.patientId,
        providerId: updated.providerId,
        startsAt: updated.startsAt.toISOString(),
      }),
    );

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

    const updated = await this.deps.unitOfWork.run(async (repositories) => {
      const current = await repositories.appointments.findByIdForUpdate(
        actor.tenantId,
        appointmentId,
      );
      if (!current) throw new NotFoundError("Agendamento nao encontrado.");
      this.deps.authorization.ensureUnit(
        actor,
        "appointment:manage",
        actor.tenantId,
        current.unitId,
      );

      const allowed = ALLOWED_TRANSITIONS[current.status];
      if (!allowed.includes(toStatus)) {
        throw new ValidationError(
          `Transicao de status invalida: ${current.status} -> ${toStatus}.`,
        );
      }

      const changed = await repositories.appointments.updateStatus(
        actor.tenantId,
        appointmentId,
        toStatus,
      );
      await repositories.statusHistory.append({
        tenantId: actor.tenantId,
        appointmentId,
        fromStatus: current.status,
        toStatus,
        changedBy: actor.userId,
      });
      await repositories.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: `appointment.status.${toStatus}`,
        resourceType: "appointment",
        resourceId: appointmentId,
        ipAddress: null,
      });
      return changed;
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
    const appointment = await this.deps.appointments.findById(
      actor.tenantId,
      appointmentId,
    );
    if (!appointment) throw new NotFoundError("Agendamento nao encontrado.");
    this.deps.authorization.ensureUnit(
      actor,
      "appointment:read",
      actor.tenantId,
      appointment.unitId,
    );
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
    resourceId: ResourceId | null,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId?: AppointmentId,
  ): Promise<void> {
    const [providerConflicts, resourceConflicts] = await Promise.all([
      this.deps.appointments.listActiveForProviderInRange(
        tenantId,
        providerId,
        startsAt,
        endsAt,
      ),
      resourceId
        ? this.deps.appointments.listActiveForResourceInRange(
            tenantId,
            resourceId,
            startsAt,
            endsAt,
          )
        : Promise.resolve([]),
    ]);
    if (providerConflicts.some((conflict) => conflict.id !== excludeAppointmentId)) {
      throw new ScheduleConflictError(
        "Ja existe um agendamento para este profissional no horario.",
      );
    }
    if (resourceConflicts.some((conflict) => conflict.id !== excludeAppointmentId)) {
      throw new ScheduleConflictError(
        "Ja existe um agendamento para este recurso no horario.",
      );
    }
  }

  private async assertReferences(
    tenantId: string,
    unitId: ClinicUnitId,
    providerId: ProviderId,
    resourceId: ResourceId | null,
  ): Promise<void> {
    const [provider, resource] = await Promise.all([
      this.deps.providers.findById(tenantId, providerId),
      resourceId ? this.deps.resources.findById(tenantId, resourceId) : null,
    ]);
    if (!provider || provider.unitId !== unitId) {
      throw new NotFoundError("Profissional nao encontrado nesta unidade.");
    }
    if (resourceId && (!resource || resource.unitId !== unitId)) {
      throw new NotFoundError("Recurso nao encontrado nesta unidade.");
    }
  }

  private async assertAvailable(
    tenantId: string,
    unitId: ClinicUnitId,
    providerId: ProviderId,
    resourceId: ResourceId | null,
    startsAt: Date,
    endsAt: Date,
  ): Promise<void> {
    const available = await this.deps.availability.isWithinAvailability(
      tenantId,
      unitId,
      providerId,
      resourceId,
      startsAt,
      endsAt,
    );
    if (!available) {
      throw new ScheduleConflictError("Horario fora da disponibilidade.");
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
