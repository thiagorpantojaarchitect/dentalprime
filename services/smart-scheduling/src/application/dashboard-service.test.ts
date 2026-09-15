import { describe, it, expect, beforeEach } from "vitest";

import { ForbiddenError, ValidationError } from "../domain/errors.js";
import { buildEnv, makeContext, seedProvider, UNIT_A } from "./test-helpers.js";

const actor = makeContext();
const PATIENT = "99999999-9999-9999-9999-999999999999";

// Janela de um dia usada nos testes.
const from = new Date("2026-03-10T00:00:00.000Z");
const to = new Date("2026-03-11T00:00:00.000Z");

async function book(
  env: ReturnType<typeof buildEnv>,
  providerId: string,
  hour: number,
): Promise<string> {
  const startsAt = new Date(`2026-03-10T${String(hour).padStart(2, "0")}:00:00.000Z`);
  const endsAt = new Date(`2026-03-10T${String(hour).padStart(2, "0")}:30:00.000Z`);
  const appointment = await env.scheduling.book(actor, {
    patientId: PATIENT,
    providerId,
    unitId: UNIT_A,
    startsAt,
    endsAt,
  });
  return appointment.id;
}

describe("DashboardService.schedulingSummary", () => {
  let env: ReturnType<typeof buildEnv>;
  let providerId: string;

  beforeEach(async () => {
    env = buildEnv();
    providerId = await seedProvider(env);
  });

  it("janela sem agendamentos: total zero e taxas nulas", async () => {
    const dash = await env.dashboard.schedulingSummary(actor, from, to);
    expect(dash.total).toBe(0);
    expect(dash.noShowRate).toBeNull();
    expect(dash.attendanceRate).toBeNull();
    expect(dash.byStatus.map((b) => b.status)).toEqual([
      "booked",
      "confirmed",
      "attended",
      "no_show",
      "cancelled",
    ]);
  });

  it("agrega por status e calcula taxa de comparecimento e de falta", async () => {
    // 3 comparecem, 1 falta, 1 fica so agendado.
    const a1 = await book(env, providerId, 8);
    const a2 = await book(env, providerId, 9);
    const a3 = await book(env, providerId, 10);
    const a4 = await book(env, providerId, 11);
    await book(env, providerId, 12); // permanece "booked"

    await env.scheduling.changeStatus(actor, a1, "attended");
    await env.scheduling.changeStatus(actor, a2, "attended");
    await env.scheduling.changeStatus(actor, a3, "attended");
    await env.scheduling.changeStatus(actor, a4, "no_show");

    const dash = await env.dashboard.schedulingSummary(actor, from, to);

    expect(dash.total).toBe(5);
    const attended = dash.byStatus.find((b) => b.status === "attended");
    const noShow = dash.byStatus.find((b) => b.status === "no_show");
    const booked = dash.byStatus.find((b) => b.status === "booked");
    expect(attended?.count).toBe(3);
    expect(noShow?.count).toBe(1);
    expect(booked?.count).toBe(1);
    // Desfechos conhecidos: 3 attended + 1 no_show = 4.
    expect(dash.attendanceRate).toBeCloseTo(0.75, 5);
    expect(dash.noShowRate).toBeCloseTo(0.25, 5);
  });

  it("exclui agendamentos fora da janela de datas", async () => {
    await book(env, providerId, 9); // dentro
    // Fora da janela (dia seguinte).
    await env.scheduling.book(actor, {
      patientId: PATIENT,
      providerId,
      unitId: UNIT_A,
      startsAt: new Date("2026-03-12T09:00:00.000Z"),
      endsAt: new Date("2026-03-12T09:30:00.000Z"),
    });

    const dash = await env.dashboard.schedulingSummary(actor, from, to);
    expect(dash.total).toBe(1);
  });

  it("registra auditoria de visualizacao do painel", async () => {
    await env.dashboard.schedulingSummary(actor, from, to);
    expect(
      env.auditRepo.entries.some((e) => e.action === "scheduling.dashboard_viewed"),
    ).toBe(true);
  });

  it("intervalo invalido (from >= to) lanca ValidationError", async () => {
    await expect(env.dashboard.schedulingSummary(actor, to, from)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("papel sem appointment:read nao acessa o painel", async () => {
    // Nenhum papel do dominio nega appointment:read a nao ser um contexto sem papeis.
    await expect(
      env.dashboard.schedulingSummary(makeContext({ roles: [] }), from, to),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
