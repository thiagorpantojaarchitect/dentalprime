import { describe, it, expect, beforeEach } from "vitest";

import { ScheduleConflictError, ValidationError } from "../domain/errors.js";
import { buildEnv, makeContext, seedProvider, UNIT_A } from "./test-helpers.js";

const actor = makeContext();
const patientId = "99999999-9999-9999-9999-999999999999";

const T = (h: number): Date =>
  new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00Z`);

describe("SchedulingService.book", () => {
  let env: ReturnType<typeof buildEnv>;
  let providerId: string;

  beforeEach(async () => {
    env = buildEnv();
    providerId = await seedProvider(env);
  });

  it("agenda quando o horario esta livre e publica evento", async () => {
    const appt = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    expect(appt.status).toBe("booked");
    expect(env.events.events.some((e) => e.type === "AppointmentBooked")).toBe(true);
    expect(env.auditRepo.entries.some((e) => e.action === "appointment.booked")).toBe(
      true,
    );
  });

  it("impede conflito de horario no mesmo provider", async () => {
    await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    await expect(
      env.scheduling.book(actor, {
        patientId,
        providerId,
        unitId: UNIT_A,
        startsAt: T(9),
        endsAt: T(10),
      }),
    ).rejects.toBeInstanceOf(ScheduleConflictError);
  });

  it("permite horario adjacente (sem sobreposicao)", async () => {
    await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    const next = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(10),
      endsAt: T(11),
    });
    expect(next.status).toBe("booked");
  });

  it("permite overbooking com politica explicita", async () => {
    await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    const over = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
      allowOverbooking: true,
    });
    expect(over.status).toBe("booked");
  });

  it("rejeita intervalo invalido (fim <= inicio)", async () => {
    await expect(
      env.scheduling.book(actor, {
        patientId,
        providerId,
        unitId: UNIT_A,
        startsAt: T(10),
        endsAt: T(9),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("SchedulingService.changeStatus", () => {
  let env: ReturnType<typeof buildEnv>;
  let providerId: string;

  beforeEach(async () => {
    env = buildEnv();
    providerId = await seedProvider(env);
  });

  it("permite transicao valida booked -> confirmed e registra historico + evento", async () => {
    const appt = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    const confirmed = await env.scheduling.changeStatus(actor, appt.id, "confirmed");
    expect(confirmed.status).toBe("confirmed");

    const history = await env.scheduling.statusHistoryFor(actor, appt.id);
    expect(history.map((h) => h.toStatus)).toEqual(["booked", "confirmed"]);
    expect(env.events.events.some((e) => e.type === "AppointmentConfirmed")).toBe(true);
  });

  it("rejeita transicao invalida (cancelled -> confirmed)", async () => {
    const appt = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    await env.scheduling.changeStatus(actor, appt.id, "cancelled");
    await expect(
      env.scheduling.changeStatus(actor, appt.id, "confirmed"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("horario liberado por cancelamento pode ser reagendado", async () => {
    const appt = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    await env.scheduling.changeStatus(actor, appt.id, "cancelled");
    // Novo agendamento no mesmo horario nao conflita (o cancelado nao conta).
    const novo = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    expect(novo.status).toBe("booked");
  });
});

describe("SchedulingService isolamento por tenant", () => {
  it("nao encontra agendamento de outro tenant ao mudar status", async () => {
    const env = buildEnv();
    const providerId = await seedProvider(env);
    const appt = await env.scheduling.book(makeContext(), {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    const otherTenantActor = makeContext({
      tenantId: "22222222-2222-2222-2222-222222222222",
    });
    await expect(
      env.scheduling.changeStatus(otherTenantActor, appt.id, "confirmed"),
    ).rejects.toThrow();
  });
});
