import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";

import { buildApp } from "./app.js";
import { buildEnv, seedProvider, TENANT_A, UNIT_A } from "./application/test-helpers.js";

const JWT_SECRET = "test-secret-com-pelo-menos-32-caracteres!!";
const ISSUER = "dentalprime-identity-access";

async function issueToken(roles: string[]): Promise<string> {
  const key = new TextEncoder().encode(JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ tenantId: TENANT_A, roles, units: [] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-1")
    .setIssuer(ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(key);
}

const patientId = "99999999-9999-9999-9999-999999999999";
const providerUserId = "33333333-3333-4333-8333-333333333333";
const T = (h: number): string => `2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`;

describe("smart-scheduling API", () => {
  let app: FastifyInstance;
  let providerId: string;

  beforeEach(async () => {
    const env = buildEnv();
    providerId = await seedProvider(env);
    app = await buildApp({ jwtSecret: JWT_SECRET, ...env });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /health responde ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("exige token na rota de agendamento", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      payload: { patientId, providerId, unitId: UNIT_A, startsAt: T(9), endsAt: T(10) },
    });
    expect(res.statusCode).toBe(401);
  });

  it("agenda com token valido e retorna 409 em conflito", async () => {
    const token = await issueToken(["front-desk"]);
    const first = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${token}` },
      payload: { patientId, providerId, unitId: UNIT_A, startsAt: T(9), endsAt: T(10) },
    });
    expect(first.statusCode).toBe(201);

    const conflict = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${token}` },
      payload: { patientId, providerId, unitId: UNIT_A, startsAt: T(9), endsAt: T(10) },
    });
    expect(conflict.statusCode).toBe(409);
  });

  it("valida corpo invalido com 400", async () => {
    const token = await issueToken(["front-desk"]);
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        patientId: "nao-uuid",
        providerId,
        unitId: UNIT_A,
        startsAt: T(9),
        endsAt: T(10),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("nega ao patient as leituras tenant-wide sem ownership", async () => {
    const token = await issueToken(["patient"]);
    const headers = { authorization: `Bearer ${token}` };
    const appointmentId = "88888888-8888-4888-8888-888888888888";
    const requests = [
      app.inject({ method: "GET", url: `/providers?unitId=${UNIT_A}`, headers }),
      app.inject({ method: "GET", url: `/resources?unitId=${UNIT_A}`, headers }),
      app.inject({
        method: "GET",
        url: `/appointments/${appointmentId}/status-history`,
        headers,
      }),
      app.inject({
        method: "GET",
        url: `/dashboard?from=${T(8)}&to=${T(12)}`,
        headers,
      }),
    ];

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.statusCode)).toEqual([
      403, 403, 403, 403,
    ]);
  });

  it("cadastra e lista providers e resources por unidade", async () => {
    const token = await issueToken(["front-desk"]);
    const headers = { authorization: `Bearer ${token}` };

    const provider = await app.inject({
      method: "POST",
      url: "/providers",
      headers,
      payload: {
        unitId: UNIT_A,
        userId: providerUserId,
        displayName: "Dra. Beatriz",
      },
    });
    expect(provider.statusCode).toBe(201);
    expect(provider.json()).toMatchObject({
      unitId: UNIT_A,
      userId: providerUserId,
      displayName: "Dra. Beatriz",
    });

    const resource = await app.inject({
      method: "POST",
      url: "/resources",
      headers,
      payload: { unitId: UNIT_A, name: "Sala 2", kind: "room" },
    });
    expect(resource.statusCode).toBe(201);
    expect(resource.json()).toMatchObject({
      unitId: UNIT_A,
      name: "Sala 2",
      kind: "room",
    });

    const providers = await app.inject({
      method: "GET",
      url: `/providers?unitId=${UNIT_A}`,
      headers,
    });
    expect(providers.statusCode).toBe(200);
    expect(providers.json().providers).toEqual(
      expect.arrayContaining([expect.objectContaining({ displayName: "Dra. Beatriz" })]),
    );

    const resources = await app.inject({
      method: "GET",
      url: `/resources?unitId=${UNIT_A}`,
      headers,
    });
    expect(resources.statusCode).toBe(200);
    expect(resources.json().resources).toEqual([
      expect.objectContaining({ name: "Sala 2", kind: "room" }),
    ]);
  });

  it("GET /dashboard exige token, valida query e agrega por status", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/dashboard" });
    expect(noAuth.statusCode).toBe(401);

    const token = await issueToken(["manager"]);
    const auth = { authorization: `Bearer ${token}` };

    // Query sem from/to: 400.
    const badQuery = await app.inject({
      method: "GET",
      url: "/dashboard",
      headers: auth,
    });
    expect(badQuery.statusCode).toBe(400);

    // Agenda e marca comparecimento.
    const booked = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: auth,
      payload: { patientId, providerId, unitId: UNIT_A, startsAt: T(9), endsAt: T(10) },
    });
    const appointmentId = booked.json().id as string;
    await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/status`,
      headers: auth,
      payload: { status: "attended" },
    });

    const from = "2026-03-10T00:00:00.000Z";
    const dto = "2026-03-11T00:00:00.000Z";
    const dash = await app.inject({
      method: "GET",
      url: `/dashboard?from=${from}&to=${dto}`,
      headers: auth,
    });
    expect(dash.statusCode).toBe(200);
    const body = dash.json();
    expect(body.total).toBe(1);
    expect(body.attendanceRate).toBe(1);
    expect(body.byStatus).toHaveLength(5);
  });
});
