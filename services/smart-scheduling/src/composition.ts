/**
 * Composicao das dependencias de producao do smart-scheduling.
 */

import { AuditService } from "./application/audit-service.js";
import { AvailabilityService } from "./application/availability-service.js";
import {
  NoopEventPublisher,
  type EventPublisher,
} from "./application/event-publisher.js";
import { ReminderService } from "./application/reminder-service.js";
import { SchedulingService } from "./application/scheduling-service.js";
import { WaitlistService } from "./application/waitlist-service.js";
import type { Config } from "./config.js";
import { AuthorizationService } from "./domain/authorization.js";
import { createDbConnection, type DbConnection } from "./infrastructure/db/client.js";
import {
  DrizzleAppointmentRepository,
  DrizzleAuditRepository,
  DrizzleAvailabilityRepository,
  DrizzleProviderRepository,
  DrizzleReminderRepository,
  DrizzleStatusHistoryRepository,
  DrizzleWaitlistRepository,
} from "./infrastructure/repositories.js";
import type { AppDeps } from "./app.js";

export interface Composition extends AppDeps {
  readonly connection: DbConnection;
}

export function composeProduction(
  config: Config,
  eventPublisher: EventPublisher = new NoopEventPublisher(),
): Composition {
  const connection = createDbConnection(config.databaseUrl);
  const db = connection.db;

  const providerRepo = new DrizzleProviderRepository(db);
  const availabilityRepo = new DrizzleAvailabilityRepository(db);
  const appointmentRepo = new DrizzleAppointmentRepository(db);
  const statusHistoryRepo = new DrizzleStatusHistoryRepository(db);
  const waitlistRepo = new DrizzleWaitlistRepository(db);
  const reminderRepo = new DrizzleReminderRepository(db);
  const auditRepo = new DrizzleAuditRepository(db);

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  const availability = new AvailabilityService({
    availabilities: availabilityRepo,
    providers: providerRepo,
    audit,
    authorization,
  });
  const scheduling = new SchedulingService({
    appointments: appointmentRepo,
    providers: providerRepo,
    statusHistory: statusHistoryRepo,
    audit,
    events: eventPublisher,
    authorization,
  });
  const reminders = new ReminderService({
    reminders: reminderRepo,
    appointments: appointmentRepo,
    audit,
    authorization,
  });
  const waitlist = new WaitlistService({
    waitlist: waitlistRepo,
    audit,
    authorization,
  });

  return {
    connection,
    jwtSecret: config.jwtSecret,
    availability,
    scheduling,
    reminders,
    waitlist,
  };
}
