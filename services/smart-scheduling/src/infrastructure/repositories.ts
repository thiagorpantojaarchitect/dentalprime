/**
 * Implementacoes Drizzle dos repositorios do smart-scheduling, com isolamento
 * por tenant. Cada consulta filtra por `tenantId`. A verificacao de conflito
 * usa sobreposicao de intervalos [startsAt, endsAt) no banco.
 */

import type { ClinicUnitId, TenantId, UserId } from "@dentalprime/core";
import { and, count, eq, gt, gte, inArray, lt, ne } from "drizzle-orm";

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
import type { Database } from "./db/client.js";
import {
  appointments,
  appointmentStatusHistory,
  auditLogs,
  availabilities,
  providers,
  resources,
  reminders,
  waitlistEntries,
} from "./db/schema.js";

export function isScheduleConflictDatabaseError(error: unknown): boolean {
  let current = error;
  const visited = new Set<unknown>();

  // Drizzle encapsula o erro do driver `pg` em `DrizzleQueryError.cause`.
  // Percorra a cadeia sem depender da classe concreta (e sem risco de ciclo),
  // pois o codigo SQLSTATE 23P01 pertence ao erro PostgreSQL interno.
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    if ("code" in current && current.code === "23P01") return true;
    visited.add(current);
    current = "cause" in current ? current.cause : undefined;
  }

  return false;
}

async function translateScheduleConflict<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isScheduleConflictDatabaseError(error)) {
      throw new ScheduleConflictError();
    }
    throw error;
  }
}

export class DrizzleProviderRepository implements ProviderRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, providerId: ProviderId): Promise<Provider | null> {
    const rows = await this.db
      .select()
      .from(providers)
      .where(and(eq(providers.tenantId, tenantId), eq(providers.id, providerId)))
      .limit(1);
    const row = rows[0];
    return row
      ? {
          id: row.id,
          tenantId: row.tenantId,
          unitId: row.unitId,
          userId: row.userId,
          displayName: row.displayName,
        }
      : null;
  }

  async listByUnit(tenantId: TenantId, unitId: ClinicUnitId): Promise<Provider[]> {
    const rows = await this.db
      .select()
      .from(providers)
      .where(and(eq(providers.tenantId, tenantId), eq(providers.unitId, unitId)))
      .orderBy(providers.displayName, providers.id);
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      unitId: row.unitId,
      userId: row.userId,
      displayName: row.displayName,
    }));
  }

  async create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    userId: UserId;
    displayName: string;
  }): Promise<Provider> {
    const rows = await this.db.insert(providers).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      unitId: row.unitId,
      userId: row.userId,
      displayName: row.displayName,
    };
  }
}

function toResource(row: typeof resources.$inferSelect): Resource {
  return {
    id: row.id,
    tenantId: row.tenantId,
    unitId: row.unitId,
    name: row.name,
    kind: row.kind,
  };
}

export class DrizzleResourceRepository implements ResourceRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, resourceId: ResourceId): Promise<Resource | null> {
    const rows = await this.db
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, tenantId), eq(resources.id, resourceId)))
      .limit(1);
    return rows[0] ? toResource(rows[0]) : null;
  }

  async listByUnit(tenantId: TenantId, unitId: ClinicUnitId): Promise<Resource[]> {
    const rows = await this.db
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, tenantId), eq(resources.unitId, unitId)))
      .orderBy(resources.name, resources.id);
    return rows.map(toResource);
  }

  async create(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    name: string;
    kind: string;
  }): Promise<Resource> {
    const rows = await this.db.insert(resources).values(input).returning();
    return toResource(rows[0]!);
  }
}

function toAvailability(row: typeof availabilities.$inferSelect): Availability {
  return {
    id: row.id,
    tenantId: row.tenantId,
    unitId: row.unitId,
    providerId: row.providerId,
    resourceId: row.resourceId,
    kind: row.kind,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

export class DrizzleAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly db: Database) {}

  async add(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    providerId: ProviderId;
    resourceId: ResourceId | null;
    kind: AvailabilityKind;
    startsAt: Date;
    endsAt: Date;
  }): Promise<Availability> {
    const rows = await this.db.insert(availabilities).values(input).returning();
    return toAvailability(rows[0]!);
  }

  async listForProviderInRange(
    tenantId: TenantId,
    unitId: ClinicUnitId,
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Availability[]> {
    // Sobreposicao: janela.startsAt < endsAt E janela.endsAt > startsAt.
    const rows = await this.db
      .select()
      .from(availabilities)
      .where(
        and(
          eq(availabilities.tenantId, tenantId),
          eq(availabilities.unitId, unitId),
          eq(availabilities.providerId, providerId),
          lt(availabilities.startsAt, endsAt),
          gt(availabilities.endsAt, startsAt),
        ),
      );
    return rows.map(toAvailability);
  }
}

function toAppointment(row: typeof appointments.$inferSelect): Appointment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    unitId: row.unitId,
    patientId: row.patientId,
    providerId: row.providerId,
    resourceId: row.resourceId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    allowOverbooking: row.allowOverbooking,
    notes: row.notes,
  };
}

export class DrizzleAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: Database) {}

  async findById(
    tenantId: TenantId,
    appointmentId: AppointmentId,
  ): Promise<Appointment | null> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)))
      .limit(1);
    return rows[0] ? toAppointment(rows[0]) : null;
  }

  async findByIdForUpdate(
    tenantId: TenantId,
    appointmentId: AppointmentId,
  ): Promise<Appointment | null> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)))
      .for("update")
      .limit(1);
    return rows[0] ? toAppointment(rows[0]) : null;
  }

  async listActiveForProviderInRange(
    tenantId: TenantId,
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Appointment[]> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.providerId, providerId),
          ne(appointments.status, "cancelled"),
          lt(appointments.startsAt, endsAt),
          gt(appointments.endsAt, startsAt),
        ),
      );
    return rows.map(toAppointment);
  }

  async listActiveForResourceInRange(
    tenantId: TenantId,
    resourceId: ResourceId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Appointment[]> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.resourceId, resourceId),
          ne(appointments.status, "cancelled"),
          lt(appointments.startsAt, endsAt),
          gt(appointments.endsAt, startsAt),
        ),
      );
    return rows.map(toAppointment);
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
    return translateScheduleConflict(async () => {
      const rows = await this.db
        .insert(appointments)
        .values({
          tenantId: input.tenantId,
          unitId: input.unitId,
          patientId: input.patientId,
          providerId: input.providerId,
          resourceId: input.resourceId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          allowOverbooking: input.allowOverbooking,
          createdBy: input.createdBy,
        })
        .returning();
      return toAppointment(rows[0]!);
    });
  }

  async updateSchedule(
    tenantId: TenantId,
    appointmentId: AppointmentId,
    startsAt: Date,
    endsAt: Date,
    allowOverbooking: boolean,
  ): Promise<Appointment> {
    return translateScheduleConflict(async () => {
      const rows = await this.db
        .update(appointments)
        .set({ startsAt, endsAt, allowOverbooking, updatedAt: new Date() })
        .where(
          and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)),
        )
        .returning();
      return toAppointment(rows[0]!);
    });
  }

  async updateStatus(
    tenantId: TenantId,
    appointmentId: AppointmentId,
    status: AppointmentStatus,
  ): Promise<Appointment> {
    const rows = await this.db
      .update(appointments)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)))
      .returning();
    return toAppointment(rows[0]!);
  }

  async summarizeByStatusInRange(
    tenantId: TenantId,
    from: Date,
    to: Date,
    unitIds?: readonly ClinicUnitId[],
  ): Promise<AppointmentStatusCount[]> {
    const rows = await this.db
      .select({ status: appointments.status, count: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          ...(unitIds && unitIds.length > 0
            ? [inArray(appointments.unitId, [...unitIds])]
            : []),
          gte(appointments.startsAt, from),
          lt(appointments.startsAt, to),
        ),
      )
      .groupBy(appointments.status);
    return rows.map((row) => ({ status: row.status, count: Number(row.count) }));
  }
}

export class DrizzleStatusHistoryRepository implements StatusHistoryRepository {
  constructor(private readonly db: Database) {}

  async append(input: {
    tenantId: TenantId;
    appointmentId: AppointmentId;
    fromStatus: AppointmentStatus | null;
    toStatus: AppointmentStatus;
    changedBy: UserId;
  }): Promise<void> {
    await this.db.insert(appointmentStatusHistory).values(input);
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
    const rows = await this.db
      .select()
      .from(appointmentStatusHistory)
      .where(
        and(
          eq(appointmentStatusHistory.tenantId, tenantId),
          eq(appointmentStatusHistory.appointmentId, appointmentId),
        ),
      )
      .orderBy(appointmentStatusHistory.changedAt);
    return rows.map((r) => ({
      fromStatus: r.fromStatus as AppointmentStatus | null,
      toStatus: r.toStatus as AppointmentStatus,
      changedBy: r.changedBy,
      changedAt: r.changedAt,
    }));
  }
}

export class DrizzleWaitlistRepository implements WaitlistRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, entryId: string): Promise<WaitlistEntry | null> {
    const rows = await this.db
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.tenantId, tenantId), eq(waitlistEntries.id, entryId)))
      .limit(1);
    const row = rows[0];
    return row
      ? {
          id: row.id,
          tenantId: row.tenantId,
          unitId: row.unitId,
          patientId: row.patientId,
          providerId: row.providerId,
          priority: row.priority,
          status: row.active,
        }
      : null;
  }

  async add(input: {
    tenantId: TenantId;
    unitId: ClinicUnitId;
    patientId: PatientId;
    providerId: ProviderId | null;
    priority: number;
  }): Promise<WaitlistEntry> {
    const rows = await this.db.insert(waitlistEntries).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      unitId: row.unitId,
      patientId: row.patientId,
      providerId: row.providerId,
      priority: row.priority,
      status: row.active,
    };
  }

  async listActiveForProvider(
    tenantId: TenantId,
    providerId: ProviderId,
  ): Promise<WaitlistEntry[]> {
    const rows = await this.db
      .select()
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.tenantId, tenantId),
          eq(waitlistEntries.providerId, providerId),
          eq(waitlistEntries.active, "active"),
        ),
      )
      .orderBy(waitlistEntries.priority);
    return rows
      .map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        unitId: row.unitId,
        patientId: row.patientId,
        providerId: row.providerId,
        priority: row.priority,
        status: row.active,
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  async markFulfilled(tenantId: TenantId, entryId: string): Promise<void> {
    await this.db
      .update(waitlistEntries)
      .set({ active: "fulfilled" })
      .where(
        and(eq(waitlistEntries.tenantId, tenantId), eq(waitlistEntries.id, entryId)),
      );
  }
}

export class DrizzleReminderRepository implements ReminderRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    appointmentId: AppointmentId;
    channel: ReminderChannel;
    scheduledFor: Date;
  }): Promise<Reminder> {
    const rows = await this.db.insert(reminders).values(input).returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      appointmentId: row.appointmentId,
      channel: row.channel,
      status: row.status,
      result: row.result,
      scheduledFor: row.scheduledFor,
    };
  }

  async markResult(
    tenantId: TenantId,
    reminderId: string,
    status: "sent" | "failed",
    result: string | null,
  ): Promise<void> {
    await this.db
      .update(reminders)
      .set({ status, result, sentAt: status === "sent" ? new Date() : null })
      .where(and(eq(reminders.tenantId, tenantId), eq(reminders.id, reminderId)));
  }
}

export class DrizzleAuditRepository implements AuditRepository {
  constructor(private readonly db: Database) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLogs).values({
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      ipAddress: entry.ipAddress,
    });
  }
}

/** PostgreSQL unit of work para a trilha clinica da agenda. */
export class DrizzleSchedulingUnitOfWork implements SchedulingUnitOfWork {
  constructor(private readonly db: Database) {}

  async run<T>(
    operation: (repositories: SchedulingTransactionRepositories) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (transaction) => {
      // Drizzle transactions implementam a mesma superficie usada pelos repositorios.
      const db = transaction as unknown as Database;
      return operation({
        appointments: new DrizzleAppointmentRepository(db),
        statusHistory: new DrizzleStatusHistoryRepository(db),
        audit: new DrizzleAuditRepository(db),
      });
    });
  }
}
