import { describe, it, expect, beforeEach } from "vitest";

import { AuthService } from "./auth-service.js";
import { AuditService } from "./audit-service.js";
import { JoseTokenService } from "./tokens.js";
import type { PasswordHasher } from "./password.js";
import { InvalidCredentialsError, UnauthenticatedError } from "../domain/errors.js";
import {
  InMemoryAuditRepository,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from "../infrastructure/memory-repositories.js";

// Hasher fake: hash("x") = "hash:x"; verify compara igualdade. Rapido e deterministico.
const fakeHasher: PasswordHasher = {
  async hash(plain) {
    return `hash:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `hash:${plain}`;
  },
};

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const JWT_SECRET = "test-secret-com-pelo-menos-32-caracteres!!";

function buildAuth() {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository();
  const sessions = new InMemorySessionRepository();
  const auditRepo = new InMemoryAuditRepository();
  const audit = new AuditService(auditRepo);
  const tokens = new JoseTokenService(JWT_SECRET, 900);
  const auth = new AuthService({
    users,
    roles,
    sessions,
    passwords: fakeHasher,
    tokens,
    audit,
    refreshTtlSeconds: 3600,
  });
  return { auth, users, roles, sessions, auditRepo, tokens };
}

async function seedActiveUser(
  users: InMemoryUserRepository,
  tenantId: string,
  email: string,
  password: string,
): Promise<string> {
  const user = await users.create({
    tenantId,
    email,
    displayName: "Teste",
    passwordHash: `hash:${password}`,
    status: "active",
  });
  return user.id;
}

describe("AuthService.login", () => {
  let env: ReturnType<typeof buildAuth>;
  beforeEach(() => {
    env = buildAuth();
  });

  it("autentica com credenciais validas e emite tokens", async () => {
    await seedActiveUser(env.users, TENANT, "dra@clinica.com", "senha-forte");
    const pair = await env.auth.login({
      tenantId: TENANT,
      email: "dra@clinica.com",
      password: "senha-forte",
    });
    expect(pair.accessToken).toBeTypeOf("string");
    expect(pair.refreshToken).toBeTypeOf("string");

    const claims = await env.tokens.verifyAccessToken(pair.accessToken);
    expect(claims.tenantId).toBe(TENANT);

    const success = env.auditRepo.entries.find((e) => e.action === "auth.login.success");
    expect(success).toBeDefined();
  });

  it("nega senha incorreta e audita a falha", async () => {
    await seedActiveUser(env.users, TENANT, "dra@clinica.com", "senha-forte");
    await expect(
      env.auth.login({ tenantId: TENANT, email: "dra@clinica.com", password: "errada" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(env.auditRepo.entries.some((e) => e.action === "auth.login.failed")).toBe(
      true,
    );
  });

  it("nao autentica usuario de outro tenant (isolamento)", async () => {
    await seedActiveUser(env.users, TENANT, "dra@clinica.com", "senha-forte");
    await expect(
      env.auth.login({
        tenantId: OTHER_TENANT,
        email: "dra@clinica.com",
        password: "senha-forte",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("nao autentica usuario pendente", async () => {
    await env.users.create({
      tenantId: TENANT,
      email: "novo@clinica.com",
      displayName: "Novo",
      passwordHash: "hash:qualquer",
      status: "pending",
    });
    await expect(
      env.auth.login({
        tenantId: TENANT,
        email: "novo@clinica.com",
        password: "qualquer",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe("AuthService.refresh", () => {
  it("rotaciona a sessao e invalida o refresh token antigo", async () => {
    const env = buildAuth();
    await seedActiveUser(env.users, TENANT, "dra@clinica.com", "senha-forte");
    const first = await env.auth.login({
      tenantId: TENANT,
      email: "dra@clinica.com",
      password: "senha-forte",
    });

    const second = await env.auth.refresh(TENANT, first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // O refresh token antigo nao vale mais.
    await expect(env.auth.refresh(TENANT, first.refreshToken)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});
