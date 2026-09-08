/**
 * Modelos de dominio do smart-scheduling.
 */

import type { ClinicUnitId, TenantId, UserId } from "@dentalprime/core";

export type ProviderId = string;
export type ResourceId = string;
export type AppointmentId = string;
export type PatientId = string;

export type AppointmentStatus =
  | "booked"
  | "confirmed"
  | "attended"
  | "no_show"
  | "cancelled";

export type AvailabilityKind = "available" | "block";

export interface Provider {
  readonly id: ProviderId;
  readonly tenantId: TenantId;
  readonly unitId: ClinicUnitId;
  readonly userId: UserId;
  readonly displayName: string;
}

export interface Availability {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly unitId: ClinicUnitId;
  readonly providerId: ProviderId;
  readonly resourceId: ResourceId | null;
  readonly kind: AvailabilityKind;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface Appointment {
  readonly id: AppointmentId;
  readonly tenantId: TenantId;
  readonly unitId: ClinicUnitId;
  readonly patientId: PatientId;
  readonly providerId: ProviderId;
  readonly resourceId: ResourceId | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: AppointmentStatus;
  readonly notes: string | null;
}

export interface WaitlistEntry {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly unitId: ClinicUnitId;
  readonly patientId: PatientId;
  readonly providerId: ProviderId | null;
  readonly priority: number;
  readonly status: "active" | "fulfilled" | "cancelled";
}

export type ReminderChannel = "sms" | "email" | "whatsapp" | "push";
export type ReminderStatus = "pending" | "sent" | "failed";

export interface Reminder {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly appointmentId: AppointmentId;
  readonly channel: ReminderChannel;
  readonly status: ReminderStatus;
  readonly result: string | null;
  readonly scheduledFor: Date;
}

export interface AuditEntry {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly ipAddress: string | null;
}

/**
 * Verifica se dois intervalos [aStart, aEnd) e [bStart, bEnd) se sobrepoem.
 * Intervalos adjacentes (fim de um = inicio do outro) NAO se sobrepoem.
 */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
