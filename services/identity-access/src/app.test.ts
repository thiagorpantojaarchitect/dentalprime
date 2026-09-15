import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import { AuthService } from "./application/auth-service.js";
import { AuditService } from "./application/audit-service.js";
import { AuthorizationService } from "./application/authorization-service.js";
import { NetworkService } from "./application/network-service.js";
import { JoseTokenService } from "./application/tokens.js";
import { UserService } from "./application/user-service.js";
import type { PasswordHasher } from "./application/password.js";
import { secureInvitationTokens } from "./application/invitation-token.js";
import {
  InMemoryAuditRepository,
  InMemoryIdentityUnitOfWork,
  InMemoryInvitationRepository,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryTenantRepository,
  InMemoryUnitRepository,
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

async function buildTestApp(
  readinessCheck?: () => Promise<void>,
  rateLimit?: { readonly max: number; readonly redis?: unknown },
  trustProxy = 0,
): Promise<{ app: FastifyInstance; ownerId: string }> {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository();
  const sessions = new InMemorySessionRepository();
  const invitations = new InMemoryInvitationRepository();
  const tenants = new InMemoryTenantRepository();
  const units = new InMemoryUnitRepository();
  const auditRepo = new InMemoryAuditRepository();
  const audit = new AuditService(auditRepo);
  const unitOfWork = new InMemoryIdentityUnitOfWork({
    users,
    roles,
    sessions,
    invitations,
    tenants,
    units,
    audit: auditRepo,
  });
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
    unitOfWork,
  });
  const userService = new UserService({
    users,
    invitations,
    roles,
    sessions,
    passwords: fakeHasher,
    audit,
    authorization,
    invitationTokens: secureInvitationTokens,
    invitationTtlSeconds: 3600,
    unitOfWork,
  });
  const network = new NetworkService({
    tenants,
    units,
    users,
    roles,
    invitations,
    audit,
    authorization,
    invitationTokens: secureInvitationTokens,
    invitationTtlSeconds: 3600,
    unitOfWork,
  });

  const app = await buildApp({
    auth,
    users: userService,
    network,
    tokens,
    loginRateLimitPerMinute: rateLimit?.max ?? 100,
    trustProxy,
    ...(rateLimit?.redis ? { rateLimitRedis: rateLimit.redis } : {}),
    ...(readinessCheck ? { readinessCheck } : {}),
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

  it("GET /ready valida dependencia sem expor detalhes da falha", async () => {
    await app.close();
    ({ app } = await buildTestApp(async () => {
      throw new Error("connection string and database details must stay private");
    }));
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "unavailable" });
    expect(res.body).not.toContain("connection string");
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

  it("usuario autenticado troca a propria senha", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        tenantId: TENANT,
        email: "owner@clinica.com",
        password: "senha-owner",
      },
    });
    const accessToken = login.json().accessToken as string;

    const changed = await app.inject({
      method: "POST",
      url: "/users/me/change-password",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        currentPassword: "senha-owner",
        newPassword: "senha-nova-muito-segura",
      },
    });
    expect(changed.statusCode).toBe(204);

    const oldLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        tenantId: TENANT,
        email: "owner@clinica.com",
        password: "senha-owner",
      },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        tenantId: TENANT,
        email: "owner@clinica.com",
        password: "senha-nova-muito-segura",
      },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it("usa o store Redis injetado para rate limit distribuido", async () => {
    await app.close();
    const counts = new Map<string, number>();
    const redis = {
      rateLimit(
        key: string,
        _timeWindow: number,
        _max: number,
        _continueExceeding: boolean,
        _exponentialBackoff: boolean,
        callback: (error: Error | null, result: [number, number]) => void,
      ): void {
        const current = (counts.get(key) ?? 0) + 1;
        counts.set(key, current);
        callback(null, [current, 60_000]);
      },
    };
    ({ app } = await buildTestApp(undefined, { max: 1, redis }));
    await app.ready();

    const request = {
      method: "POST" as const,
      url: "/auth/login",
      payload: {
        tenantId: TENANT,
        email: "owner@clinica.com",
        password: "senha-owner",
      },
    };
    expect((await app.inject(request)).statusCode).toBe(200);
    expect((await app.inject(request)).statusCode).toBe(429);
    expect([...counts.keys()][0]).toContain("POST/auth/login");
  });

  it("confia apenas CloudFront e ALB e ignora prefixo XFF forjado", async () => {
    await app.close();
    ({ app } = await buildTestApp(undefined, { max: 1 }, 2));
    await app.ready();

    const request = (spoofed: string) => ({
      method: "POST" as const,
      url: "/auth/login",
      headers: {
        "x-forwarded-for": `${spoofed}, 198.51.100.10, 192.0.2.15`,
      },
      payload: {
        tenantId: TENANT,
        email: "owner@clinica.com",
        password: "senha-owner",
      },
    });
    expect((await app.inject(request("203.0.113.1"))).statusCode).toBe(200);
    expect((await app.inject(request("203.0.113.2"))).statusCode).toBe(429);
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
    expect(invited.json().activationToken).toBeTypeOf("string");

    const activated = await app.inject({
      method: "POST",
      url: "/users/activate",
      payload: {
        tenantId: TENANT,
        activationToken: invited.json().activationToken,
        password: "senha-nova-segura",
      },
    });
    expect(activated.statusCode).toBe(204);

    const reused = await app.inject({
      method: "POST",
      url: "/users/activate",
      payload: {
        tenantId: TENANT,
        activationToken: invited.json().activationToken,
        password: "senha-nao-deve-substituir",
      },
    });
    expect(reused.statusCode).toBe(404);
  });

  it("valida corpo invalido com 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenantId: "nao-uuid", email: "x", password: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rede: owner cria e lista unidades e lista usuarios", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenantId: TENANT, email: "owner@clinica.com", password: "senha-owner" },
    });
    const token = login.json().accessToken as string;
    const auth = { authorization: `Bearer ${token}` };

    // Sem token: 401.
    const noAuth = await app.inject({ method: "GET", url: "/units" });
    expect(noAuth.statusCode).toBe(401);

    // Cria unidade.
    const created = await app.inject({
      method: "POST",
      url: "/units",
      headers: auth,
      payload: { name: "Unidade Centro" },
    });
    expect(created.statusCode).toBe(201);
    const unitId = created.json().id as string;

    // Lista unidades.
    const units = await app.inject({ method: "GET", url: "/units", headers: auth });
    expect(units.statusCode).toBe(200);
    expect(units.json().units).toHaveLength(1);
    expect(units.json()).toMatchObject({ page: 1, pageSize: 50, hasMore: false });

    // Desativa unidade.
    const deactivated = await app.inject({
      method: "POST",
      url: `/units/${unitId}/deactivate`,
      headers: auth,
    });
    expect(deactivated.statusCode).toBe(204);

    // Lista usuarios (o proprio owner) com papeis.
    const usersRes = await app.inject({ method: "GET", url: "/users", headers: auth });
    expect(usersRes.statusCode).toBe(200);
    const list = usersRes.json().users as Array<{ email: string; roles: string[] }>;
    expect(
      list.some((u) => u.email === "owner@clinica.com" && u.roles.includes("owner")),
    ).toBe(true);
  });

  it("valida page/pageSize e limita pageSize a 100", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenantId: TENANT, email: "owner@clinica.com", password: "senha-owner" },
    });
    const headers = {
      authorization: `Bearer ${login.json().accessToken as string}`,
    };

    const page = await app.inject({
      method: "GET",
      url: "/users?page=1&pageSize=1",
      headers,
    });
    expect(page.statusCode).toBe(200);
    expect(page.json()).toMatchObject({ page: 1, pageSize: 1, hasMore: false });

    const invalid = await app.inject({
      method: "GET",
      url: "/users?page=0&pageSize=101",
      headers,
    });
    expect(invalid.statusCode).toBe(400);
  });
});
