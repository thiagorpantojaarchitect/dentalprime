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

describe("ai-front-desk API", () => {
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

  it("exige token para iniciar conversa", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/conversations",
      payload: { channel: "chat" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("fluxo: conversa, mensagem responde com isAI; conteudo clinico faz handoff", async () => {
    const token = await issueToken(["front-desk"]);
    const auth = { authorization: `Bearer ${token}` };

    const conv = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: auth,
      payload: { channel: "chat", contactRef: "c1" },
    });
    expect(conv.statusCode).toBe(201);
    const conversationId = conv.json().id as string;

    const ok = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: auth,
      payload: { content: "Quero marcar uma consulta" },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().reply.isAI).toBe(true);
    expect(ok.json().handedOff).toBe(false);

    const clinical = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: auth,
      payload: { content: "Qual remedio devo tomar?" },
    });
    expect(clinical.statusCode).toBe(201);
    expect(clinical.json().handedOff).toBe(true);
  });

  it("sugestao de agendamento retorna status pending (nao agenda)", async () => {
    const token = await issueToken(["front-desk"]);
    const auth = { authorization: `Bearer ${token}` };

    const conv = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: auth,
      payload: { channel: "chat" },
    });
    const conversationId = conv.json().id as string;

    const suggestion = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/scheduling-suggestions`,
      headers: auth,
      payload: { suggestedSlots: ["2026-04-01T09:00:00Z"] },
    });
    expect(suggestion.statusCode).toBe(201);
    expect(suggestion.json().reviewStatus).toBe("pending");
  });
});
