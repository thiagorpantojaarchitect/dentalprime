/**
 * Implementacoes em memoria dos repositorios, para testes. Respeitam o mesmo
 * contrato de isolamento por tenant e a semantica de intervalos.
 */

import type { ClinicUnitId, TenantId, UserId } from "@dentalprime/core";
import { randomUUID } from "node:crypto";

import {
  intervalsOverlap,
  type Appointment,
  type AppointmentId,
  type AppointmentStatus,
  type AuditEntry,
  type Availability,
  type AvailabilityKind,
  type PatientId,
  type Provider,
  type ProviderId,
  type Resource,
  type Reminder,
  type ReminderChannel,
  type ResourceId,
  type WaitlistEntry,
} from "../domain/models.js";
import { ScheduleConflictError } from "../domain/errors.js";
import type {
  AppointmentRepository,
  AppointmentStatusCount,
  AuditRepository,
  AvailabilityRepository,
  ProviderRepository,
  ResourceRepository,
  ReminderRepository,
  SchedulingTransactionRepositories,
  SchedulingUnitOfWork,
  StatusHistoryRepository,
  WaitlistRepository,
} from "../domain/repositories.js";

export class InMemoryProviderRepository implements ProviderRepository {
  private readonly rows = new Map<string, Provider>();

  async findById(tenantId: TenantId, providerId: ProviderId): Promise<Provider | null> {
    const p = this.rows.get(providerId);
    return p && p.tenantId === tenantId ? p : null;
  }

  async listByUnit(tenantId: TenantId, unitId: ClinicUnitId): Promise<Provider[]> {
    return [...this.rows.values()]
      .filter((provider) => provider.tenantId === tenantId && provider.unitId === unitId)
      .sort(
        (a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id),
      );
  }

  async create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    userId: UserId;
    displayName: string;
  }): Promise<Provider> {
    const provider: Provider = { id: randomUUID(), ...input };
    this.rows.set(provider.id, provider);
    return provider;
  }
}

export class InMemoryResourceRepository implements ResourceRepository {
  private readonly rows = new Map<string, Resource>();

  async findById(tenantId: TenantId, resourceId: ResourceId): Promise<Resource | null> {
    const resource = this.rows.get(resourceId);
    return resource?.tenantId === tenantId ? resource : null;
  }

  async listByUnit(tenantId: TenantId, unitId: ClinicUnitId): Promise<Resource[]> {
    return [...this.rows.values()]
      .filter((resource) => resource.tenantId === tenantId && resource.unitId === unitId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  async create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    name: string;
    kind: string;
  }): Promise<Resource> {
    const resource = { id: randomUUID(), ...input };
    this.rows.set(resource.id, resource);
    return resource;
  }
}

export class InMemoryAvailabilityRepository implements AvailabilityRepository {
  private readonly rows: Availability[] = [];

  async add(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    providerId: ProviderId;
    resourceId: ResourceId | null;
    kind: AvailabilityKind;
    startsAt: Date;
    endsAt: Date;
  }): Promise<Availability> {
    const availability: Availability = { id: randomUUID(), ...input };
    this.rows.push(availability);
    return availability;
  }

  async listForProviderInRange(
    tenantId: TenantId,
    unitId: ClinicUnitId,
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Availability[]> {
    return this.rows.filter(
      (a) =>
        a.tenantId === tenantId &&
        a.unitId === unitId &&
        a.providerId === providerId &&
        intervalsOverlap(a.startsAt, a.endsAt, startsAt, endsAt),
    );
  }
}

export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly rows = new Map<string, Appointment>();

  snapshotState(): Map<string, Appointment> {
    return new Map(this.rows);
  }

  restoreState(snapshot: ReadonlyMap<string, Appointment>): void {
    this.rows.clear();
    for (const [id, appointment] of snapshot) this.rows.set(id, appointment);
  }

  async findById(
    tenantId: TenantId,
    appointmentId: AppointmentId,
  ): Promise<Appointment | null> {
    const a = this.rows.get(appointmentId);
    return a && a.tenantId === tenantId ? a : null;
  }

  async findByIdForUpdate(
    tenantId: TenantId,
    appointmentId: AppointmentId,
  ): Promise<Appointment | null> {
    // InMemorySchedulingUnitOfWork serializa todas as operacoes de escrita.
    return this.findById(tenantId, appointmentId);
  }

  async listActiveForProviderInRange(
    tenantId: TenantId,
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Appointment[]> {
    return [...this.rows.values()].filter(
      (a) =>
        a.tenantId === tenantId &&
        a.providerId === providerId &&
        a.status !== "cancelled" &&
        intervalsOverlap(a.startsAt, a.endsAt, startsAt, endsAt),
    );
  }

  async listActiveForResourceInRange(
    tenantId: TenantId,
    resourceId: ResourceId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Appointment[]> {
    return [...this.rows.values()].filter(
      (appointment) =>
        appointment.tenantId === tenantId &&
        appointment.resourceId === resourceId &&
        appointment.status !== "cancelled" &&
        intervalsOverlap(appointment.startsAt, appointment.endsAt, startsAt, endsAt),
    );
  }

  async create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    patientId: PatientId;
    providerId: ProviderId;
    resourceId: ResourceId | null;
    startsAt: Date;
    endsAt: Date;
    allowOverbooking: boolean;
    createdBy: UserId;
  }): Promise<Appointment> {
    this.ensureNoConflict(input);
    const appointment: Appointment = {
      id: randomUUID(),
      tenantId: input.tenantId,
      unitId: input.unitId,
      patientId: input.patientId,
      providerId: input.providerId,
      resourceId: input.resourceId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: "booked",
      allowOverbooking: input.allowOverbooking,
      notes: null,
    };
    this.rows.set(appointment.id, appointment);
    return appointment;
  }

  async updateSchedule(
    tenantId: TenantId,
    appointmentId: AppointmentId,
    startsAt: Date,
    endsAt: Date,
    allowOverbooking: boolean,
  ): Promise<Appointment> {
    const current = await this.findById(tenantId, appointmentId);
    if (!current) throw new Error("appointment nao encontrado");
    this.ensureNoConflict(
      { ...current, startsAt, endsAt, allowOverbooking },
      appointmentId,
    );
    const updated: Appointment = { ...current, startsAt, endsAt, allowOverbooking };
    this.rows.set(appointmentId, updated);
    return updated;
  }

  private ensureNoConflict(
    input: {
      tenantId: TenantId;
      providerId: ProviderId;
      resourceId: ResourceId | null;
      startsAt: Date;
      endsAt: Date;
      allowOverbooking: boolean;
    },
    excludeAppointmentId?: AppointmentId,
  ): void {
    if (input.allowOverbooking) return;
    for (const appointment of this.rows.values()) {
      if (
        appointment.id === excludeAppointmentId ||
        appointment.tenantId !== input.tenantId ||
        appointment.status === "cancelled" ||
        !intervalsOverlap(
          appointment.startsAt,
          appointment.endsAt,
          input.startsAt,
          input.endsAt,
        )
      ) {
        continue;
      }
      if (
        appointment.providerId === input.providerId ||
        (input.resourceId !== null && appointment.resourceId === input.resourceId)
      ) {
        throw new ScheduleConflictError();
      }
    }
  }

  async updateStatus(
    tenantId: TenantId,
    appointmentId: AppointmentId,
    status: AppointmentStatus,
  ): Promise<Appointment> {
    const current = await this.findById(tenantId, appointmentId);
    if (!current) throw new Error("appointment nao encontrado");
    const updated: Appointment = { ...current, status };
    this.rows.set(appointmentId, updated);
    return updated;
  }

  async summarizeByStatusInRange(
    tenantId: TenantId,
    from: Date,
    to: Date,
    unitIds?: readonly ClinicUnitId[],
  ): Promise<AppointmentStatusCount[]> {
    const counts = new Map<AppointmentStatus, number>();
    for (const a of this.rows.values()) {
      if (a.tenantId !== tenantId) continue;
      if (unitIds && unitIds.length > 0 && !unitIds.includes(a.unitId)) continue;
      const start = a.startsAt.getTime();
      if (start < from.getTime() || start >= to.getTime()) continue;
      counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
    }
    return [...counts.entries()].map(([status, count]) => ({ status, count }));
  }
}

export class InMemoryStatusHistoryRepository implements StatusHistoryRepository {
  private readonly rows: Array<{
    tenantId: TenantId;
    appointmentId: AppointmentId;
    fromStatus: AppointmentStatus | null;
    toStatus: AppointmentStatus;
    changedBy: UserId;
    changedAt: Date;
  }> = [];

  snapshotState(): typeof this.rows {
    return [...this.rows];
  }

  restoreState(snapshot: typeof this.rows): void {
    this.rows.splice(0, this.rows.length, ...snapshot);
  }

  async append(input: {
    tenantId: TenantId;
    appointmentId: AppointmentId;
    fromStatus: AppointmentStatus | null;
    toStatus: AppointmentStatus;
    changedBy: UserId;
  }): Promise<void> {
    this.rows.push({ ...input, changedAt: new Date() });
  }

  async listForAppointment(
    tenantId: TenantId,
    appointmentId: AppointmentId,
  ): Promise<
    Array<{
      fromStatus: AppointmentStatus | null;
      toStatus: AppointmentStatus;
      changedBy: UserId;
      changedAt: Date;
    }>
  > {
    return this.rows
      .filter((r) => r.tenantId === tenantId && r.appointmentId === appointmentId)
      .map((r) => ({
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        changedBy: r.changedBy,
        changedAt: r.changedAt,
      }));
  }
}

export class InMemoryWaitlistRepository implements WaitlistRepository {
  private readonly rows = new Map<string, WaitlistEntry>();

  async findById(tenantId: TenantId, entryId: string): Promise<WaitlistEntry | null> {
    const entry = this.rows.get(entryId);
    return entry?.tenantId === tenantId ? entry : null;
  }

  async add(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    patientId: PatientId;
    providerId: ProviderId | null;
    priority: number;
  }): Promise<WaitlistEntry> {
    const entry: WaitlistEntry = { id: randomUUID(), status: "active", ...input };
    this.rows.set(entry.id, entry);
    return entry;
  }

  async listActiveForProvider(
    tenantId: TenantId,
    providerId: ProviderId,
  ): Promise<WaitlistEntry[]> {
    return [...this.rows.values()]
      .filter(
        (e) =>
          e.tenantId === tenantId && e.providerId === providerId && e.status === "active",
      )
      .sort((a, b) => b.priority - a.priority);
  }

  async markFulfilled(tenantId: TenantId, entryId: string): Promise<void> {
    const entry = this.rows.get(entryId);
    if (entry && entry.tenantId === tenantId) {
      this.rows.set(entryId, { ...entry, status: "fulfilled" });
    }
  }
}

export class InMemoryReminderRepository implements ReminderRepository {
  public readonly rows = new Map<string, Reminder>();

  async create(input: {
    tenantId: TenantId;
    appointmentId: AppointmentId;
    channel: ReminderChannel;
    scheduledFor: Date;
  }): Promise<Reminder> {
    const reminder: Reminder = {
      id: randomUUID(),
      tenantId: input.tenantId,
      appointmentId: input.appointmentId,
      channel: input.channel,
      status: "pending",
      result: null,
      scheduledFor: input.scheduledFor,
    };
    this.rows.set(reminder.id, reminder);
    return reminder;
  }

  async markResult(
    tenantId: TenantId,
    reminderId: string,
    status: "sent" | "failed",
    result: string | null,
  ): Promise<void> {
    const reminder = this.rows.get(reminderId);
    if (reminder && reminder.tenantId === tenantId) {
      this.rows.set(reminderId, { ...reminder, status, result });
    }
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  public readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  snapshotState(): AuditEntry[] {
    return [...this.entries];
  }

  restoreState(snapshot: readonly AuditEntry[]): void {
    this.entries.splice(0, this.entries.length, ...snapshot);
  }
}

/**
 * Unit of work transacional para testes. Serializa workflows e restaura os
 * tres repositorios se qualquer escrita falhar.
 */
export class InMemorySchedulingUnitOfWork implements SchedulingUnitOfWork {
  private exclusiveTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly repositories: {
      readonly appointments: InMemoryAppointmentRepository;
      readonly statusHistory: InMemoryStatusHistoryRepository;
      readonly audit: InMemoryAuditRepository;
    },
  ) {}

  async run<T>(
    operation: (repositories: SchedulingTransactionRepositories) => Promise<T>,
  ): Promise<T> {
    const previous = this.exclusiveTail;
    let release!: () => void;
    this.exclusiveTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const appointmentSnapshot = this.repositories.appointments.snapshotState();
    const historySnapshot = this.repositories.statusHistory.snapshotState();
    const auditSnapshot = this.repositories.audit.snapshotState();
    try {
      return await operation(this.repositories);
    } catch (error) {
      this.repositories.appointments.restoreState(appointmentSnapshot);
      this.repositories.statusHistory.restoreState(historySnapshot);
      this.repositories.audit.restoreState(auditSnapshot);
      throw error;
    } finally {
      release();
    }
  }
}
