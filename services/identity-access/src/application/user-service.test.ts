import { describe, it, expect, beforeEach } from "vitest";
import type { TenantContext } from "@dentalprime/core";

import { UserService } from "./user-service.js";
import { AuditService } from "./audit-service.js";
import { AuthorizationService } from "./authorization-service.js";
import type { PasswordHasher } from "./password.js";
import type { InvitationTokenService } from "./invitation-token.js";
import { ConflictError, ForbiddenError } from "../domain/errors.js";
import {
  InMemoryAuditRepository,
  InMemoryIdentityUnitOfWork,
  InMemoryInvitationRepository,
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryTenantRepository,
  InMemoryUnitRepository,
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

let tokenSequence = 0;
const fakeInvitationTokens: InvitationTokenService = {
  generate: () => `activation-token-${++tokenSequence}-with-enough-entropy-for-tests`,
  hash: (token) => `sha256:${token}`,
};

function build() {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository();
  const sessions = new InMemorySessionRepository();
  const invitations = new InMemoryInvitationRepository();
  const auditRepo = new InMemoryAuditRepository();
  const unitOfWork = new InMemoryIdentityUnitOfWork({
    users,
    roles,
    sessions,
    invitations,
    tenants: new InMemoryTenantRepository(),
    units: new InMemoryUnitRepository(),
    audit: auditRepo,
  });
  const service = new UserService({
    users,
    invitations,
    roles,
    sessions,
    passwords: fakeHasher,
    audit: new AuditService(auditRepo),
    authorization: new AuthorizationService(),
    invitationTokens: fakeInvitationTokens,
    invitationTtlSeconds: 3600,
    unitOfWork,
  });
  return { service, users, roles, sessions, invitations, auditRepo };
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
    expect(user.activationToken).not.toContain("sha256:");
    expect([...env.invitations.rows.values()][0]?.tokenHash).toBe(
      `sha256:${user.activationToken}`,
    );
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
    await env.service.activate(TENANT, user.activationToken, "senha-de-ativacao");

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

describe("UserService.activate", () => {
  it("consome o convite uma unica vez e impede reset de conta ativa", async () => {
    const env = build();
    const invited = await env.service.invite(owner, {
      email: "ativar@clinica.com",
      displayName: "Ativar",
      role: "assistant",
    });

    await env.service.activate(TENANT, invited.activationToken, "primeira-senha");
    await expect(
      env.service.activate(TENANT, invited.activationToken, "senha-trocada"),
    ).rejects.toThrow("Convite invalido ou expirado");

    const active = await env.users.findById(TENANT, invited.id);
    expect(active?.status).toBe("active");
    expect(active?.passwordHash).toBe("hash:primeira-senha");

    const unexpectedToken = "second-valid-token-created-by-an-administrator";
    await env.invitations.create({
      tenantId: TENANT,
      userId: invited.id,
      tokenHash: fakeInvitationTokens.hash(unexpectedToken),
      expiresAt: new Date(Date.now() + 60_000),
      createdByUserId: owner.userId,
    });
    await expect(
      env.service.activate(TENANT, unexpectedToken, "senha-trocada"),
    ).rejects.toThrow("Conta ja ativada ou indisponivel");
    expect((await env.users.findById(TENANT, invited.id))?.passwordHash).toBe(
      "hash:primeira-senha",
    );
  });

  it("recusa convite expirado", async () => {
    const users = new InMemoryUserRepository();
    const roles = new InMemoryRoleRepository();
    const sessions = new InMemorySessionRepository();
    const invitations = new InMemoryInvitationRepository();
    const auditRepo = new InMemoryAuditRepository();
    const unitOfWork = new InMemoryIdentityUnitOfWork({
      users,
      roles,
      sessions,
      invitations,
      tenants: new InMemoryTenantRepository(),
      units: new InMemoryUnitRepository(),
      audit: auditRepo,
    });
    const service = new UserService({
      users,
      invitations,
      roles,
      sessions,
      passwords: fakeHasher,
      audit: new AuditService(auditRepo),
      authorization: new AuthorizationService(),
      invitationTokens: fakeInvitationTokens,
      invitationTtlSeconds: -1,
      unitOfWork,
    });
    const invited = await service.invite(owner, {
      email: "expirado@clinica.com",
      displayName: "Expirado",
      role: "assistant",
    });

    await expect(
      service.activate(TENANT, invited.activationToken, "senha-segura"),
    ).rejects.toThrow("Convite invalido ou expirado");
  });

  it("nao consome o convite quando a criacao do hash falha", async () => {
    const env = build();
    const invited = await env.service.invite(owner, {
      email: "retry@clinica.com",
      displayName: "Retry",
      role: "assistant",
    });
    // Reconstruimos apenas o servico, preservando os mesmos repositorios.
    const unitOfWork = new InMemoryIdentityUnitOfWork({
      users: env.users,
      roles: env.roles,
      sessions: env.sessions,
      invitations: env.invitations,
      tenants: new InMemoryTenantRepository(),
      units: new InMemoryUnitRepository(),
      audit: env.auditRepo,
    });
    const service = new UserService({
      users: env.users,
      invitations: env.invitations,
      roles: env.roles,
      sessions: env.sessions,
      passwords: {
        ...fakeHasher,
        hash: async () => {
          throw new Error("hash indisponivel");
        },
      },
      audit: new AuditService(env.auditRepo),
      authorization: new AuthorizationService(),
      invitationTokens: fakeInvitationTokens,
      invitationTtlSeconds: 3600,
      unitOfWork,
    });
    await expect(
      service.activate(TENANT, invited.activationToken, "senha-segura"),
    ).rejects.toThrow("hash indisponivel");
    expect([...env.invitations.rows.values()][0]?.usedAt).toBeNull();
  });
});

describe("UserService.changeOwnPassword", () => {
  it("troca a senha, revoga sessoes e audita sem permitir reutilizar a atual", async () => {
    const env = build();
    const user = await env.users.create({
      tenantId: TENANT,
      email: "owner@clinica.com",
      displayName: "Owner",
      passwordHash: "hash:senha-atual-segura",
      status: "active",
    });
    const actor = { ...owner, userId: user.id };
    await env.sessions.create({
      tenantId: TENANT,
      userId: user.id,
      refreshTokenHash: "refresh-hash",
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: null,
      ipAddress: null,
    });

    await expect(
      env.service.changeOwnPassword(actor, "senha-atual-segura", "senha-atual-segura"),
    ).rejects.toBeInstanceOf(ConflictError);
    await env.service.changeOwnPassword(
      actor,
      "senha-atual-segura",
      "senha-nova-muito-segura",
    );

    expect((await env.users.findById(TENANT, user.id))?.passwordHash).toBe(
      "hash:senha-nova-muito-segura",
    );
    expect(await env.sessions.findActiveByHash(TENANT, "refresh-hash")).toBeNull();
    expect(env.auditRepo.entries.some((e) => e.action === "user.password_changed")).toBe(
      true,
    );
  });

  it("recusa senha atual incorreta com erro generico", async () => {
    const env = build();
    const user = await env.users.create({
      tenantId: TENANT,
      email: "user@clinica.com",
      displayName: "User",
      passwordHash: "hash:senha-atual",
      status: "active",
    });
    await expect(
      env.service.changeOwnPassword(
        { ...owner, userId: user.id },
        "incorreta",
        "senha-nova-muito-segura",
      ),
    ).rejects.toThrow("Credenciais invalidas");
  });
});
