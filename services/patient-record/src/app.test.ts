import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";

import { buildApp } from "./app.js";
import { buildServices, TENANT_A, VALID_CPF_1 } from "./application/test-helpers.js";

const JWT_SECRET = "test-secret-com-pelo-menos-32-caracteres!!";
const ISSUER = "dentalprime-identity-access";

/** Emite um access token como o identity-access faria (mesmo segredo e issuer). */
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

describe("patient-record API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const services = buildServices();
    app = await buildApp({ jwtSecret: JWT_SECRET, ...services });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /health responde ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("rota protegida exige token (401 sem Authorization)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/patients",
      payload: { fullName: "Maria", cpf: VALID_CPF_1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("com token de dentista, cadastra e le paciente", async () => {
    const token = await issueToken(["dentist"]);
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: { fullName: "Maria Silva", cpf: VALID_CPF_1 },
    });
    expect(created.statusCode).toBe(201);
    const patientId = created.json().id as string;

    const got = await app.inject({
      method: "GET",
      url: `/patients/${patientId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().fullName).toBe("Maria Silva");
  });

  it("papel patient sem permissao recebe 403", async () => {
    const token = await issueToken(["patient"]);
    const res = await app.inject({
      method: "POST",
      url: "/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: { fullName: "Maria", cpf: VALID_CPF_1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("CPF invalido retorna 400", async () => {
    const token = await issueToken(["dentist"]);
    const res = await app.inject({
      method: "POST",
      url: "/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: { fullName: "Maria", cpf: "111.111.111-11" },
    });
    expect(res.statusCode).toBe(400);
  });
});
