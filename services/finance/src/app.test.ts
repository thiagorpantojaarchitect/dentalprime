import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";

import { buildApp } from "./app.js";
import { buildEnv, PATIENT_A, TENANT_A, UNIT_A } from "./application/test-helpers.js";

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

describe("finance API", () => {
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

  it("exige token para criar fatura", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/invoices",
      payload: { patientId: PATIENT_A, unitId: UNIT_A },
    });
    expect(res.statusCode).toBe(401);
  });

  it("fluxo: cria fatura, item e pagamento total", async () => {
    const token = await issueToken(["manager"]);
    const auth = { authorization: `Bearer ${token}` };

    const inv = await app.inject({
      method: "POST",
      url: "/invoices",
      headers: auth,
      payload: { patientId: PATIENT_A, unitId: UNIT_A },
    });
    expect(inv.statusCode).toBe(201);
    const invoiceId = inv.json().id as string;

    const item = await app.inject({
      method: "POST",
      url: `/invoices/${invoiceId}/items`,
      headers: auth,
      payload: { description: "Consulta", unitPrice: "150.00" },
    });
    expect(item.statusCode).toBe(201);

    const pay = await app.inject({
      method: "POST",
      url: `/invoices/${invoiceId}/payments`,
      headers: auth,
      payload: { amount: "150.00", method: "pix" },
    });
    expect(pay.statusCode).toBe(201);
    expect(pay.json().invoiceStatus).toBe("paid");
    expect(pay.json().balanceCents).toBe(0);
  });

  it("pagamento acima do saldo retorna 409", async () => {
    const token = await issueToken(["manager"]);
    const auth = { authorization: `Bearer ${token}` };

    const inv = await app.inject({
      method: "POST",
      url: "/invoices",
      headers: auth,
      payload: { patientId: PATIENT_A, unitId: UNIT_A },
    });
    const invoiceId = inv.json().id as string;
    await app.inject({
      method: "POST",
      url: `/invoices/${invoiceId}/items`,
      headers: auth,
      payload: { description: "Consulta", unitPrice: "100.00" },
    });

    const pay = await app.inject({
      method: "POST",
      url: `/invoices/${invoiceId}/payments`,
      headers: auth,
      payload: { amount: "200.00", method: "cash" },
    });
    expect(pay.statusCode).toBe(409);
  });
});
