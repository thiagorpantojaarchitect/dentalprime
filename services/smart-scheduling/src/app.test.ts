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
});
