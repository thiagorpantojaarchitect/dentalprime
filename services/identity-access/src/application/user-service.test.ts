import { describe, it, expect, beforeEach } from "vitest";
import type { TenantContext } from "@dentalprime/core";

import { UserService } from "./user-service.js";
import { AuditService } from "./audit-service.js";
import { AuthorizationService } from "./authorization-service.js";
import type { PasswordHasher } from "./password.js";
import { ConflictError, ForbiddenError } from "../domain/errors.js";
import {
  InMemoryAuditRepository,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from "../infrastructure/memory-repositories.js";

const fakeHasher: PasswordHasher = {
  async hash(plain) {
    return `hash:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `hash:${plain}`;
  },
};

const TENANT = "11111111-1111-1111-1111-111111111111";

function build() {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository();
  const sessions = new InMemorySessionRepository();
  const auditRepo = new InMemoryAuditRepository();
  const service = new UserService({
    users,
    roles,
    sessions,
    passwords: fakeHasher,
    audit: new AuditService(auditRepo),
    authorization: new AuthorizationService(),
  });
  return { service, users, roles, sessions, auditRepo };
}

const owner: TenantContext = {
  tenantId: TENANT,
  userId: "owner-1",
  roles: ["owner"],
  units: [],
};

const frontDesk: TenantContext = {
  tenantId: TENANT,
  userId: "fd-1",
  roles: ["front-desk"],
  units: [],
};

describe("UserService.invite", () => {
  let env: ReturnType<typeof build>;
  beforeEach(() => {
    env = build();
  });

  it("owner convida usuario, cria pendente e audita", async () => {
    const user = await env.service.invite(owner, {
      email: "novo@clinica.com",
      displayName: "Novo",
      role: "dentist",
    });
    expect(user.status).toBe("pending");
    const assignments = await env.roles.listForUser(TENANT, user.id);
    expect(assignments.map((a) => a.role)).toContain("dentist");
    expect(env.auditRepo.entries.some((e) => e.action === "user.invited")).toBe(true);
  });

  it("front-desk nao pode convidar (autorizacao nega)", async () => {
    await expect(
      env.service.invite(frontDesk, {
        email: "x@clinica.com",
        displayName: "X",
        role: "assistant",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nao permite email duplicado no tenant", async () => {
    await env.service.invite(owner, {
      email: "dup@clinica.com",
      displayName: "Dup",
      role: "assistant",
    });
    await expect(
      env.service.invite(owner, {
        email: "dup@clinica.com",
        displayName: "Dup 2",
        role: "assistant",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("UserService.deactivate", () => {
  it("desativa usuario e revoga sessoes ativas", async () => {
    const env = build();
    const user = await env.service.invite(owner, {
      email: "sai@clinica.com",
      displayName: "Sai",
      role: "assistant",
    });
    await env.service.activate(TENANT, user.id, "senha-de-ativacao");

    // Cria uma sessao ativa para o usuario.
    await env.sessions.create({
      tenantId: TENANT,
      userId: user.id,
      refreshTokenHash: "hash-sessao",
      expiresAt: new Date(Date.now() + 3600_000),
      userAgent: null,
      ipAddress: null,
    });
    expect(await env.sessions.findActiveByHash(TENANT, "hash-sessao")).not.toBeNull();

    await env.service.deactivate(owner, user.id);

    const disabled = await env.users.findById(TENANT, user.id);
    expect(disabled?.status).toBe("disabled");
    // Sessao encerrada.
    expect(await env.sessions.findActiveByHash(TENANT, "hash-sessao")).toBeNull();
    expect(env.auditRepo.entries.some((e) => e.action === "user.deactivated")).toBe(true);
  });
});
