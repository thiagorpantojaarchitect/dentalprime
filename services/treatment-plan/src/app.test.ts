import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";

import { buildApp } from "./app.js";
import { buildEnv, PATIENT_A, TENANT_A } from "./application/test-helpers.js";

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

describe("treatment-plan API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const env = buildEnv();
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

  it("exige token para criar plano", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/plans",
      payload: { patientId: PATIENT_A, title: "Plano" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("fluxo: cria procedimento, plano, item e aceita item", async () => {
    const token = await issueToken(["dentist"]);
    const auth = { authorization: `Bearer ${token}` };

    const proc = await app.inject({
      method: "POST",
      url: "/procedures",
      headers: auth,
      payload: { name: "Canal", baseCost: "800.00" },
    });
    expect(proc.statusCode).toBe(201);
    const procedureId = proc.json().id as string;

    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers: auth,
      payload: { patientId: PATIENT_A, title: "Plano" },
    });
    expect(plan.statusCode).toBe(201);
    const planKey = plan.json().planKey as string;

    const item = await app.inject({
      method: "POST",
      url: `/plans/${planKey}/items`,
      headers: auth,
      payload: { procedureId },
    });
    expect(item.statusCode).toBe(201);
    const itemId = item.json().id as string;

    const decision = await app.inject({
      method: "POST",
      url: `/plans/${planKey}/items/${itemId}/decision`,
      headers: auth,
      payload: { decision: "accepted" },
    });
    expect(decision.statusCode).toBe(201);
    expect(decision.json().decision).toBe("accepted");
  });

  it("codigo licenciado retorna 422", async () => {
    const token = await issueToken(["manager"]);
    const res = await app.inject({
      method: "POST",
      url: "/procedures",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Restauracao", baseCost: "200.00", licensedCode: "D2140" },
    });
    expect(res.statusCode).toBe(422);
  });
});
