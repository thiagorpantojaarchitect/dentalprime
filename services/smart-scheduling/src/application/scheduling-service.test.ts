import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  NotFoundError,
  ScheduleConflictError,
  ValidationError,
} from "../domain/errors.js";
import {
  buildEnv,
  makeContext,
  seedProvider,
  seedResource,
  TENANT_A,
  UNIT_A,
  UNIT_B,
} from "./test-helpers.js";

const actor = makeContext();
const patientId = "99999999-9999-9999-9999-999999999999";

const T = (h: number): Date =>
  new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00Z`);

afterEach(() => vi.restoreAllMocks());

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

  it("nega agendamento fora das unidades atribuidas ao ator", async () => {
    await expect(
      env.scheduling.book(
        makeContext({ units: ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] }),
        {
          patientId,
          providerId,
          unitId: UNIT_A,
          startsAt: T(9),
          endsAt: T(10),
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
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
    expect(over.allowOverbooking).toBe(true);
  });

  it("rejeita horario fora de uma janela available", async () => {
    const unavailableProvider = await seedProvider(env, TENANT_A, false);
    await expect(
      env.scheduling.book(actor, {
        patientId,
        providerId: unavailableProvider,
        unitId: UNIT_A,
        startsAt: T(9),
        endsAt: T(10),
      }),
    ).rejects.toBeInstanceOf(ScheduleConflictError);
  });

  it("rejeita horario interceptado por um bloqueio", async () => {
    await env.availability.add(actor, {
      providerId,
      unitId: UNIT_A,
      kind: "block",
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
        allowOverbooking: true,
      }),
    ).rejects.toBeInstanceOf(ScheduleConflictError);
  });

  it("valida que o recurso existe no mesmo tenant e unidade", async () => {
    await expect(
      env.scheduling.book(actor, {
        patientId,
        providerId,
        unitId: UNIT_A,
        resourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        startsAt: T(9),
        endsAt: T(10),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("impede conflito de recurso entre providers diferentes", async () => {
    const resourceId = await seedResource(env);
    const otherProviderId = await seedProvider(env);
    await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      resourceId,
      startsAt: T(9),
      endsAt: T(10),
    });

    await expect(
      env.scheduling.book(actor, {
        patientId,
        providerId: otherProviderId,
        unitId: UNIT_A,
        resourceId,
        startsAt: T(9),
        endsAt: T(10),
      }),
    ).rejects.toBeInstanceOf(ScheduleConflictError);
  });

  it("serializa reservas concorrentes e aceita apenas uma", async () => {
    const input = {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    };
    const results = await Promise.allSettled([
      env.scheduling.book(actor, input),
      env.scheduling.book(actor, input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure).toMatchObject({ reason: expect.any(ScheduleConflictError) });
  });

  it("faz rollback de appointment e historico se a auditoria falhar", async () => {
    const auditCount = env.auditRepo.entries.length;
    vi.spyOn(env.auditRepo, "append").mockRejectedValueOnce(
      new Error("falha de auditoria simulada"),
    );

    await expect(
      env.scheduling.book(actor, {
        patientId,
        providerId,
        unitId: UNIT_A,
        startsAt: T(9),
        endsAt: T(10),
      }),
    ).rejects.toThrow("falha de auditoria simulada");

    expect(
      await env.appointmentRepo.listActiveForProviderInRange(
        TENANT_A,
        providerId,
        T(9),
        T(10),
      ),
    ).toHaveLength(0);
    expect(env.auditRepo.entries).toHaveLength(auditCount);
    expect(env.events.events.some((event) => event.type === "AppointmentBooked")).toBe(
      false,
    );
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

describe("SchedulingService.reschedule", () => {
  let env: ReturnType<typeof buildEnv>;
  let providerId: string;

  beforeEach(async () => {
    env = buildEnv();
    providerId = await seedProvider(env);
  });

  it("revalida disponibilidade e publica AppointmentRescheduled", async () => {
    const appointment = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    const updated = await env.scheduling.reschedule(actor, appointment.id, T(10), T(11));
    expect(updated.startsAt).toEqual(T(10));
    expect(
      env.events.events.some((event) => event.type === "AppointmentRescheduled"),
    ).toBe(true);
  });

  it("impede reagendamento que conflita por provider", async () => {
    await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    const later = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(10),
      endsAt: T(11),
    });
    await expect(
      env.scheduling.reschedule(actor, later.id, T(9), T(10)),
    ).rejects.toBeInstanceOf(ScheduleConflictError);
  });

  it("impede reagendamento para janela bloqueada", async () => {
    const appointment = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    await env.availability.add(actor, {
      providerId,
      unitId: UNIT_A,
      kind: "block",
      startsAt: T(10),
      endsAt: T(11),
    });

    await expect(
      env.scheduling.reschedule(actor, appointment.id, T(10), T(11), true),
    ).rejects.toBeInstanceOf(ScheduleConflictError);
  });

  it("impede reagendamento que conflita por recurso", async () => {
    const resourceId = await seedResource(env);
    const otherProviderId = await seedProvider(env);
    await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      resourceId,
      startsAt: T(9),
      endsAt: T(10),
    });
    const later = await env.scheduling.book(actor, {
      patientId,
      providerId: otherProviderId,
      unitId: UNIT_A,
      resourceId,
      startsAt: T(10),
      endsAt: T(11),
    });
    await expect(
      env.scheduling.reschedule(actor, later.id, T(9), T(10)),
    ).rejects.toBeInstanceOf(ScheduleConflictError);
  });

  it("restaura a agenda se a auditoria do reagendamento falhar", async () => {
    const appointment = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    const auditCount = env.auditRepo.entries.length;
    vi.spyOn(env.auditRepo, "append").mockRejectedValueOnce(
      new Error("falha de auditoria simulada"),
    );

    await expect(
      env.scheduling.reschedule(actor, appointment.id, T(10), T(11)),
    ).rejects.toThrow("falha de auditoria simulada");

    expect(await env.appointmentRepo.findById(TENANT_A, appointment.id)).toMatchObject({
      startsAt: T(9),
      endsAt: T(10),
    });
    expect(env.auditRepo.entries).toHaveLength(auditCount);
    expect(
      env.events.events.some((event) => event.type === "AppointmentRescheduled"),
    ).toBe(false);
  });

  it("serializa reagendamento com cancelamento concorrente", async () => {
    const appointment = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });

    const [rescheduleResult, cancelResult] = await Promise.allSettled([
      env.scheduling.reschedule(actor, appointment.id, T(10), T(11)),
      env.scheduling.changeStatus(actor, appointment.id, "cancelled"),
    ]);

    expect(cancelResult.status).toBe("fulfilled");
    const stored = await env.appointmentRepo.findById(TENANT_A, appointment.id);
    expect(stored?.status).toBe("cancelled");
    expect(stored?.startsAt).toEqual(
      rescheduleResult.status === "fulfilled" ? T(10) : T(9),
    );
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

  it("restaura status e historico se a auditoria da transicao falhar", async () => {
    const appointment = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });
    const auditCount = env.auditRepo.entries.length;
    const historyBefore = await env.scheduling.statusHistoryFor(actor, appointment.id);
    vi.spyOn(env.auditRepo, "append").mockRejectedValueOnce(
      new Error("falha de auditoria simulada"),
    );

    await expect(
      env.scheduling.changeStatus(actor, appointment.id, "confirmed"),
    ).rejects.toThrow("falha de auditoria simulada");

    expect(await env.appointmentRepo.findById(TENANT_A, appointment.id)).toMatchObject({
      status: "booked",
    });
    expect(await env.scheduling.statusHistoryFor(actor, appointment.id)).toHaveLength(
      historyBefore.length,
    );
    expect(env.auditRepo.entries).toHaveLength(auditCount);
    expect(env.events.events.some((event) => event.type === "AppointmentConfirmed")).toBe(
      false,
    );
  });

  it("lineariza transicoes de status concorrentes", async () => {
    const appointment = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });

    const results = await Promise.allSettled([
      env.scheduling.changeStatus(actor, appointment.id, "confirmed"),
      env.scheduling.changeStatus(actor, appointment.id, "cancelled"),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);

    const stored = await env.appointmentRepo.findById(TENANT_A, appointment.id);
    const history = await env.scheduling.statusHistoryFor(actor, appointment.id);
    for (let index = 1; index < history.length; index += 1) {
      expect(history[index]!.fromStatus).toBe(history[index - 1]!.toStatus);
    }
    expect(stored?.status).toBe(history.at(-1)?.toStatus);
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

  it("nega historico de status para ator de outra unidade", async () => {
    const env = buildEnv();
    const providerId = await seedProvider(env);
    const appointment = await env.scheduling.book(actor, {
      patientId,
      providerId,
      unitId: UNIT_A,
      startsAt: T(9),
      endsAt: T(10),
    });

    await expect(
      env.scheduling.statusHistoryFor(makeContext({ units: [UNIT_B] }), appointment.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
