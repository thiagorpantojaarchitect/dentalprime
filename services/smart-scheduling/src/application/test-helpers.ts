import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  InMemoryAppointmentRepository,
  InMemoryAuditRepository,
  InMemoryAvailabilityRepository,
  InMemoryProviderRepository,
  InMemoryResourceRepository,
  InMemoryReminderRepository,
  InMemorySchedulingUnitOfWork,
  InMemoryStatusHistoryRepository,
  InMemoryWaitlistRepository,
} from "../infrastructure/memory-repositories.js";
import { AuditService } from "./audit-service.js";
import { AvailabilityService } from "./availability-service.js";
import { DashboardService } from "./dashboard-service.js";
import { InMemoryEventPublisher } from "./event-publisher.js";
import { ReminderService } from "./reminder-service.js";
import { SchedulingService } from "./scheduling-service.js";
import { WaitlistService } from "./waitlist-service.js";

export const TENANT_A = "11111111-1111-1111-1111-111111111111";
export const TENANT_B = "22222222-2222-2222-2222-222222222222";
export const UNIT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const UNIT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

export function makeContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: TENANT_A,
    userId: "user-1",
    roles: ["front-desk"],
    units: [],
    ...overrides,
  };
}

export function buildEnv() {
  const providerRepo = new InMemoryProviderRepository();
  const resourceRepo = new InMemoryResourceRepository();
  const availabilityRepo = new InMemoryAvailabilityRepository();
  const appointmentRepo = new InMemoryAppointmentRepository();
  const statusHistoryRepo = new InMemoryStatusHistoryRepository();
  const waitlistRepo = new InMemoryWaitlistRepository();
  const reminderRepo = new InMemoryReminderRepository();
  const auditRepo = new InMemoryAuditRepository();
  const events = new InMemoryEventPublisher();
  const unitOfWork = new InMemorySchedulingUnitOfWork({
    appointments: appointmentRepo,
    statusHistory: statusHistoryRepo,
    audit: auditRepo,
  });

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();
  const availability = new AvailabilityService({
    availabilities: availabilityRepo,
    providers: providerRepo,
    resources: resourceRepo,
    audit,
    authorization,
  });

  return {
    providerRepo,
    resourceRepo,
    appointmentRepo,
    auditRepo,
    events,
    availability,
    scheduling: new SchedulingService({
      appointments: appointmentRepo,
      providers: providerRepo,
      resources: resourceRepo,
      availability,
      statusHistory: statusHistoryRepo,
      unitOfWork,
      events,
      authorization,
    }),
    reminders: new ReminderService({
      reminders: reminderRepo,
      appointments: appointmentRepo,
      audit,
      authorization,
      events,
    }),
    waitlist: new WaitlistService({
      waitlist: waitlistRepo,
      providers: providerRepo,
      audit,
      authorization,
    }),
    dashboard: new DashboardService({
      appointments: appointmentRepo,
      audit,
      authorization,
    }),
  };
}

/** Cria um provider no tenant informado e retorna seu id. */
export async function seedProvider(
  env: ReturnType<typeof buildEnv>,
  tenantId = TENANT_A,
  withAvailability = true,
  unitId = UNIT_A,
): Promise<string> {
  const provider = await env.providerRepo.create({
    tenantId,
    unitId,
    userId: "user-provider",
    displayName: "Dr. Teste",
  });
  if (withAvailability) {
    await env.availability.add(makeContext({ tenantId }), {
      providerId: provider.id,
      unitId,
      kind: "available",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2027-01-01T00:00:00.000Z"),
    });
  }
  return provider.id;
}

export async function seedResource(
  env: ReturnType<typeof buildEnv>,
  tenantId = TENANT_A,
  unitId = UNIT_A,
): Promise<string> {
  const resource = await env.resourceRepo.create({
    tenantId,
    unitId,
    name: "Cadeira 1",
    kind: "chair",
  });
  return resource.id;
}
