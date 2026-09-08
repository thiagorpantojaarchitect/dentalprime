import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  InMemoryAppointmentRepository,
  InMemoryAuditRepository,
  InMemoryAvailabilityRepository,
  InMemoryProviderRepository,
  InMemoryReminderRepository,
  InMemoryStatusHistoryRepository,
  InMemoryWaitlistRepository,
} from "../infrastructure/memory-repositories.js";
import { AuditService } from "./audit-service.js";
import { AvailabilityService } from "./availability-service.js";
import { InMemoryEventPublisher } from "./event-publisher.js";
import { ReminderService } from "./reminder-service.js";
import { SchedulingService } from "./scheduling-service.js";
import { WaitlistService } from "./waitlist-service.js";

export const TENANT_A = "11111111-1111-1111-1111-111111111111";
export const TENANT_B = "22222222-2222-2222-2222-222222222222";
export const UNIT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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
  const availabilityRepo = new InMemoryAvailabilityRepository();
  const appointmentRepo = new InMemoryAppointmentRepository();
  const statusHistoryRepo = new InMemoryStatusHistoryRepository();
  const waitlistRepo = new InMemoryWaitlistRepository();
  const reminderRepo = new InMemoryReminderRepository();
  const auditRepo = new InMemoryAuditRepository();
  const events = new InMemoryEventPublisher();

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  return {
    providerRepo,
    auditRepo,
    events,
    availability: new AvailabilityService({
      availabilities: availabilityRepo,
      providers: providerRepo,
      audit,
      authorization,
    }),
    scheduling: new SchedulingService({
      appointments: appointmentRepo,
      providers: providerRepo,
      statusHistory: statusHistoryRepo,
      audit,
      events,
      authorization,
    }),
    reminders: new ReminderService({
      reminders: reminderRepo,
      appointments: appointmentRepo,
      audit,
      authorization,
    }),
    waitlist: new WaitlistService({
      waitlist: waitlistRepo,
      audit,
      authorization,
    }),
  };
}

/** Cria um provider no tenant informado e retorna seu id. */
export async function seedProvider(
  env: ReturnType<typeof buildEnv>,
  tenantId = TENANT_A,
): Promise<string> {
  const provider = await env.providerRepo.create({
    tenantId,
    unitId: UNIT_A,
    userId: "user-provider",
    displayName: "Dr. Teste",
  });
  return provider.id;
}
