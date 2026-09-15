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
  Resource,
  Reminder,
  ReminderChannel,
  ResourceId,
  WaitlistEntry,
} from "./models.js";

export interface ProviderRepository {
  findById(tenantId: TenantId, providerId: ProviderId): Promise<Provider | null>;
  listByUnit(tenantId: TenantId, unitId: ClinicUnitId): Promise<Provider[]>;
  create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    userId: UserId;
    displayName: string;
  }): Promise<Provider>;
}

export interface ResourceRepository {
  findById(tenantId: TenantId, resourceId: ResourceId): Promise<Resource | null>;
  listByUnit(tenantId: TenantId, unitId: ClinicUnitId): Promise<Resource[]>;
  create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    name: string;
    kind: string;
  }): Promise<Resource>;
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
    unitId: ClinicUnitId,
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Availability[]>;
}

export interface AppointmentRepository {
  findById(tenantId: TenantId, appointmentId: AppointmentId): Promise<Appointment | null>;
  /** Le a linha bloqueando alteracoes concorrentes ate o fim da transacao atual. */
  findByIdForUpdate(
    tenantId: TenantId,
    appointmentId: AppointmentId,
  ): Promise<Appointment | null>;
  /** Agendamentos ativos (nao cancelados) de um provider no intervalo. */
  listActiveForProviderInRange(
    tenantId: TenantId,
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Appointment[]>;
  /** Agendamentos ativos de qualquer provider usando o recurso no intervalo. */
  listActiveForResourceInRange(
    tenantId: TenantId,
    resourceId: ResourceId,
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
    allowOverbooking: boolean;
    createdBy: UserId;
  }): Promise<Appointment>;
  updateSchedule(
    tenantId: TenantId,
    appointmentId: AppointmentId,
    startsAt: Date,
    endsAt: Date,
    allowOverbooking: boolean,
  ): Promise<Appointment>;
  updateStatus(
    tenantId: TenantId,
    appointmentId: AppointmentId,
    status: AppointmentStatus,
  ): Promise<Appointment>;
  /**
   * Agrega os agendamentos do tenant por status em uma janela de datas
   * (por `startsAt`, intervalo [from, to)). Read-only; usado pelo dashboard.
   */
  summarizeByStatusInRange(
    tenantId: TenantId,
    from: Date,
    to: Date,
    unitIds?: readonly ClinicUnitId[],
  ): Promise<AppointmentStatusCount[]>;
}

/** Contagem de agendamentos para um status. */
export interface AppointmentStatusCount {
  readonly status: AppointmentStatus;
  readonly count: number;
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
  findById(tenantId: TenantId, entryId: string): Promise<WaitlistEntry | null>;
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

/** Repositorios vinculados a uma mesma transacao de agenda. */
export interface SchedulingTransactionRepositories {
  readonly appointments: AppointmentRepository;
  readonly statusHistory: StatusHistoryRepository;
  readonly audit: AuditRepository;
}

/**
 * Executa alteracoes de agendamento, historico e auditoria de forma atomica.
 * Eventos externos sao publicados somente depois do commit.
 */
export interface SchedulingUnitOfWork {
  run<T>(
    operation: (repositories: SchedulingTransactionRepositories) => Promise<T>,
  ): Promise<T>;
}
