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
  type Reminder,
  type ReminderChannel,
  type ResourceId,
  type WaitlistEntry,
} from "../domain/models.js";
import type {
  AppointmentRepository,
  AuditRepository,
  AvailabilityRepository,
  ProviderRepository,
  ReminderRepository,
  StatusHistoryRepository,
  WaitlistRepository,
} from "../domain/repositories.js";

export class InMemoryProviderRepository implements ProviderRepository {
  private readonly rows = new Map<string, Provider>();

  async findById(tenantId: TenantId, providerId: ProviderId): Promise<Provider | null> {
    const p = this.rows.get(providerId);
    return p && p.tenantId === tenantId ? p : null;
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
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Availability[]> {
    return this.rows.filter(
      (a) =>
        a.tenantId === tenantId &&
        a.providerId === providerId &&
        intervalsOverlap(a.startsAt, a.endsAt, startsAt, endsAt),
    );
  }
}

export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly rows = new Map<string, Appointment>();

  async findById(
    tenantId: TenantId,
    appointmentId: AppointmentId,
  ): Promise<Appointment | null> {
    const a = this.rows.get(appointmentId);
    return a && a.tenantId === tenantId ? a : null;
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

  async create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    patientId: PatientId;
    providerId: ProviderId;
    resourceId: ResourceId | null;
    startsAt: Date;
    endsAt: Date;
    createdBy: UserId;
  }): Promise<Appointment> {
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
  ): Promise<Appointment> {
    const current = await this.findById(tenantId, appointmentId);
    if (!current) throw new Error("appointment nao encontrado");
    const updated: Appointment = { ...current, startsAt, endsAt };
    this.rows.set(appointmentId, updated);
    return updated;
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
}
