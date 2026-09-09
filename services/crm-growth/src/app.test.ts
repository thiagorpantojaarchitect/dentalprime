import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";

import { buildApp } from "./app.js";
import { buildEnv, TENANT_A } from "./application/test-helpers.js";

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

describe("crm-growth API", () => {
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

  it("exige token para criar lead", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/leads",
      payload: { name: "Joao" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("fluxo: opt-in, campanha e selecao de publico respeita opt-out", async () => {
    const token = await issueToken(["manager"]);
    const auth = { authorization: `Bearer ${token}` };

    await app.inject({
      method: "POST",
      url: "/consent/opt-in",
      headers: auth,
      payload: { contactRef: "ok", purpose: "reactivation", channel: "email" },
    });

    const camp = await app.inject({
      method: "POST",
      url: "/campaigns",
      headers: auth,
      payload: { name: "C", purpose: "reactivation", channel: "email" },
    });
    expect(camp.statusCode).toBe(201);
    const campaignId = camp.json().id as string;

    const audience = await app.inject({
      method: "POST",
      url: `/campaigns/${campaignId}/audience`,
      headers: auth,
      payload: { candidateContactRefs: ["ok", "sem-opt-in"] },
    });
    expect(audience.statusCode).toBe(200);
    expect(audience.json().eligible).toEqual(["ok"]);
    expect(audience.json().excluded).toEqual(["sem-opt-in"]);
  });

  it("papel patient recebe 403 ao criar lead", async () => {
    const token = await issueToken(["patient"]);
    const res = await app.inject({
      method: "POST",
      url: "/leads",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Joao" },
    });
    expect(res.statusCode).toBe(403);
  });
});
