import { describe, expect, it } from "vitest";

import { ForbiddenError } from "../domain/errors.js";
import {
  buildEnv,
  makeContext,
  seedProvider,
  TENANT_A,
  UNIT_A,
  UNIT_B,
} from "./test-helpers.js";

describe("ReminderService", () => {
  it("persists and publishes a minimal ReminderScheduled job", async () => {
    const env = buildEnv();
    const actor = makeContext();
    const providerId = await seedProvider(env);
    const appointment = await env.appointmentRepo.create({
      tenantId: TENANT_A,
      unitId: UNIT_A,
      patientId: "patient-1",
      providerId,
      resourceId: null,
      startsAt: new Date("2026-09-20T12:00:00.000Z"),
      endsAt: new Date("2026-09-20T13:00:00.000Z"),
      allowOverbooking: false,
      createdBy: actor.userId,
    });

    const reminder = await env.reminders.schedule(actor, {
      appointmentId: appointment.id,
      channel: "email",
      scheduledFor: new Date("2026-09-19T12:00:00.000Z"),
    });

    expect(reminder.status).toBe("pending");
    expect(env.events.events).toHaveLength(1);
    expect(env.events.events[0]).toMatchObject({
      type: "ReminderScheduled",
      version: 1,
      tenantId: TENANT_A,
      payload: { reminderId: reminder.id, appointmentId: appointment.id },
    });
  });

  it("nega lembrete para agendamento de outra unidade", async () => {
    const env = buildEnv();
    const providerId = await seedProvider(env);
    const appointment = await env.appointmentRepo.create({
      tenantId: TENANT_A,
      unitId: UNIT_A,
      patientId: "patient-1",
      providerId,
      resourceId: null,
      startsAt: new Date("2026-09-20T12:00:00.000Z"),
      endsAt: new Date("2026-09-20T13:00:00.000Z"),
      allowOverbooking: false,
      createdBy: "user-1",
    });

    await expect(
      env.reminders.schedule(makeContext({ units: [UNIT_B] }), {
        appointmentId: appointment.id,
        channel: "email",
        scheduledFor: new Date("2026-09-19T12:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
