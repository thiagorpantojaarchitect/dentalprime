/**
 * Contratos de repositorio do smart-scheduling. Todo metodo recebe `tenantId`
 * explicitamente; a implementacao aplica o filtro por tenant (e unidade, quando
 * aplicavel) em toda consulta.
 */

import type { ClinicUnitId, TenantId, UserId } from "@dentalprime/core";

import type {
  Appointment,
  AppointmentId,
  AppointmentStatus,
  AuditEntry,
  Availability,
  AvailabilityKind,
  PatientId,
  Provider,
  ProviderId,
  Reminder,
  ReminderChannel,
  ResourceId,
  WaitlistEntry,
} from "./models.js";

export interface ProviderRepository {
  findById(tenantId: TenantId, providerId: ProviderId): Promise<Provider | null>;
  create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    userId: UserId;
    displayName: string;
  }): Promise<Provider>;
}

export interface AvailabilityRepository {
  add(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    providerId: ProviderId;
    resourceId: ResourceId | null;
    kind: AvailabilityKind;
    startsAt: Date;
    endsAt: Date;
  }): Promise<Availability>;
  /** Janelas de um provider que interceptam o intervalo informado. */
  listForProviderInRange(
    tenantId: TenantId,
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Availability[]>;
}

export interface AppointmentRepository {
  findById(tenantId: TenantId, appointmentId: AppointmentId): Promise<Appointment | null>;
  /** Agendamentos ativos (nao cancelados) de um provider no intervalo. */
  listActiveForProviderInRange(
    tenantId: TenantId,
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Appointment[]>;
  create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    patientId: PatientId;
    providerId: ProviderId;
    resourceId: ResourceId | null;
    startsAt: Date;
    endsAt: Date;
    createdBy: UserId;
  }): Promise<Appointment>;
  updateSchedule(
    tenantId: TenantId,
    appointmentId: AppointmentId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Appointment>;
  updateStatus(
    tenantId: TenantId,
    appointmentId: AppointmentId,
    status: AppointmentStatus,
  ): Promise<Appointment>;
}

export interface StatusHistoryRepository {
  append(input: {
    tenantId: TenantId;
    appointmentId: AppointmentId;
    fromStatus: AppointmentStatus | null;
    toStatus: AppointmentStatus;
    changedBy: UserId;
  }): Promise<void>;
  listForAppointment(
    tenantId: TenantId,
    appointmentId: AppointmentId,
  ): Promise<
    Array<{
      fromStatus: AppointmentStatus | null;
      toStatus: AppointmentStatus;
      changedBy: UserId;
      changedAt: Date;
    }>
  >;
}

export interface WaitlistRepository {
  add(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    patientId: PatientId;
    providerId: ProviderId | null;
    priority: number;
  }): Promise<WaitlistEntry>;
  /** Entradas ativas de um provider, ordenadas por prioridade desc. */
  listActiveForProvider(
    tenantId: TenantId,
    providerId: ProviderId,
  ): Promise<WaitlistEntry[]>;
  markFulfilled(tenantId: TenantId, entryId: string): Promise<void>;
}

export interface ReminderRepository {
  create(input: {
    tenantId: TenantId;
    appointmentId: AppointmentId;
    channel: ReminderChannel;
    scheduledFor: Date;
  }): Promise<Reminder>;
  markResult(
    tenantId: TenantId,
    reminderId: string,
    status: "sent" | "failed",
    result: string | null,
  ): Promise<void>;
}

export interface AuditRepository {
  append(entry: AuditEntry): Promise<void>;
}
