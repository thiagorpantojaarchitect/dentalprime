/**
 * Composicao das dependencias de producao do smart-scheduling.
 */

import { AwsEventBridgePublisher } from "@dentalprime/core";

import { AuditService } from "./application/audit-service.js";
import { AvailabilityService } from "./application/availability-service.js";
import { DashboardService } from "./application/dashboard-service.js";
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
  DrizzleResourceRepository,
  DrizzleReminderRepository,
  DrizzleSchedulingUnitOfWork,
  DrizzleStatusHistoryRepository,
  DrizzleWaitlistRepository,
} from "./infrastructure/repositories.js";
import type { AppDeps } from "./app.js";

export interface Composition extends AppDeps {
  readonly connection: DbConnection;
}

function configuredEventPublisher(config: Config): EventPublisher {
  if (config.eventProvider === "noop") {
    if (config.deploymentEnv !== "development") {
      throw new Error("NoopEventPublisher e permitido somente em development.");
    }
    return new NoopEventPublisher();
  }
  if (!config.eventBusName) {
    throw new Error("EVENT_BUS_NAME e obrigatoria para EventBridge.");
  }
  return new AwsEventBridgePublisher({
    eventBusName: config.eventBusName,
    region: config.awsRegion,
    source: "dentalprime.smart-scheduling",
  });
}

export function composeProduction(
  config: Config,
  eventPublisher?: EventPublisher,
): Composition {
  const connection = createDbConnection(config.databaseUrl);
  const db = connection.db;

  const providerRepo = new DrizzleProviderRepository(db);
  const resourceRepo = new DrizzleResourceRepository(db);
  const availabilityRepo = new DrizzleAvailabilityRepository(db);
  const appointmentRepo = new DrizzleAppointmentRepository(db);
  const statusHistoryRepo = new DrizzleStatusHistoryRepository(db);
  const waitlistRepo = new DrizzleWaitlistRepository(db);
  const reminderRepo = new DrizzleReminderRepository(db);
  const auditRepo = new DrizzleAuditRepository(db);
  const unitOfWork = new DrizzleSchedulingUnitOfWork(db);

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();
  const events = eventPublisher ?? configuredEventPublisher(config);

  const availability = new AvailabilityService({
    availabilities: availabilityRepo,
    providers: providerRepo,
    resources: resourceRepo,
    audit,
    authorization,
  });
  const scheduling = new SchedulingService({
    appointments: appointmentRepo,
    providers: providerRepo,
    resources: resourceRepo,
    availability,
    statusHistory: statusHistoryRepo,
    unitOfWork,
    events,
    authorization,
  });
  const reminders = new ReminderService({
    reminders: reminderRepo,
    appointments: appointmentRepo,
    audit,
    authorization,
    events,
  });
  const waitlist = new WaitlistService({
    waitlist: waitlistRepo,
    providers: providerRepo,
    audit,
    authorization,
  });
  const dashboard = new DashboardService({
    appointments: appointmentRepo,
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
    dashboard,
    trustProxy: config.trustProxy,
    readinessCheck: connection.checkReady,
  };
}
