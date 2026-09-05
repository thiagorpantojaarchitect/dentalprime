import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import { AuthService } from "./application/auth-service.js";
import { AuditService } from "./application/audit-service.js";
import { AuthorizationService } from "./application/authorization-service.js";
import { JoseTokenService } from "./application/tokens.js";
import { UserService } from "./application/user-service.js";
import type { PasswordHasher } from "./application/password.js";
import {
  InMemoryAuditRepository,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from "./infrastructure/memory-repositories.js";

const fakeHasher: PasswordHasher = {
  async hash(plain) {
    return `hash:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `hash:${plain}`;
  },
};

const TENANT = "11111111-1111-1111-1111-111111111111";
const JWT_SECRET = "test-secret-com-pelo-menos-32-caracteres!!";

async function buildTestApp(): Promise<{ app: FastifyInstance; ownerId: string }> {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository();
  const sessions = new InMemorySessionRepository();
  const audit = new AuditService(new InMemoryAuditRepository());
  const tokens = new JoseTokenService(JWT_SECRET, 900);
  const authorization = new AuthorizationService();

  const owner = await users.create({
    tenantId: TENANT,
    email: "owner@clinica.com",
    displayName: "Owner",
    passwordHash: "hash:senha-owner",
    status: "active",
  });
  await roles.assign(TENANT, owner.id, "owner", null);

  const auth = new AuthService({
    users,
    roles,
    sessions,
    passwords: fakeHasher,
    tokens,
    audit,
    refreshTtlSeconds: 3600,
  });
  const userService = new UserService({
    users,
    roles,
    sessions,
    passwords: fakeHasher,
    audit,
    authorization,
  });

  const app = await buildApp({
    auth,
    users: userService,
    tokens,
    loginRateLimitPerMinute: 100,
  });
  return { app, ownerId: owner.id };
}

describe("identity-access API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await buildTestApp());
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /health responde ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("login valido retorna tokens; login invalido retorna 401", async () => {
    const ok = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenantId: TENANT, email: "owner@clinica.com", password: "senha-owner" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().accessToken).toBeTypeOf("string");

    const bad = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenantId: TENANT, email: "owner@clinica.com", password: "errada" },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("rota protegida exige token; owner autenticado consegue convidar", async () => {
    const noAuth = await app.inject({
      method: "POST",
      url: "/users/invite",
      payload: { email: "novo@clinica.com", displayName: "Novo", role: "dentist" },
    });
    expect(noAuth.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenantId: TENANT, email: "owner@clinica.com", password: "senha-owner" },
    });
    const token = login.json().accessToken as string;

    const invited = await app.inject({
      method: "POST",
      url: "/users/invite",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "novo@clinica.com", displayName: "Novo", role: "dentist" },
    });
    expect(invited.statusCode).toBe(201);
    expect(invited.json().status).toBe("pending");
  });

  it("valida corpo invalido com 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenantId: "nao-uuid", email: "x", password: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});
