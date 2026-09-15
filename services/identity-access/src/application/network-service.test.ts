import { describe, it, expect, beforeEach } from "vitest";
import type { TenantContext } from "@dentalprime/core";

import { NetworkService } from "./network-service.js";
import { AuditService } from "./audit-service.js";
import { AuthorizationService } from "./authorization-service.js";
import { secureInvitationTokens } from "./invitation-token.js";
import { ForbiddenError, NotFoundError } from "../domain/errors.js";
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

const TENANT = "11111111-1111-1111-1111-111111111111";

function build() {
  const tenants = new InMemoryTenantRepository();
  const units = new InMemoryUnitRepository();
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository();
  const auditRepo = new InMemoryAuditRepository();
  const invitations = new InMemoryInvitationRepository();
  const sessions = new InMemorySessionRepository();
  const unitOfWork = new InMemoryIdentityUnitOfWork({
    users,
    roles,
    sessions,
    invitations,
    tenants,
    units,
    audit: auditRepo,
  });
  const service = new NetworkService({
    tenants,
    units,
    users,
    roles,
    invitations,
    audit: new AuditService(auditRepo),
    authorization: new AuthorizationService(),
    invitationTokens: secureInvitationTokens,
    invitationTtlSeconds: 3600,
    unitOfWork,
  });
  return { service, tenants, units, users, roles, auditRepo };
}

const owner: TenantContext = {
  tenantId: TENANT,
  userId: "owner-1",
  roles: ["owner"],
  units: [],
};

const platformAdmin: TenantContext = {
  tenantId: TENANT,
  userId: "platform-admin-1",
  roles: ["platform-admin"],
  units: [],
};

const frontDesk: TenantContext = {
  tenantId: TENANT,
  userId: "fd-1",
  roles: ["front-desk"],
  units: [],
};

describe("NetworkService.provisionTenant", () => {
  let env: ReturnType<typeof build>;
  beforeEach(() => {
    env = build();
  });

  it("platform-admin provisiona tenant, cria owner pendente e audita", async () => {
    const result = await env.service.provisionTenant(platformAdmin, {
      name: "Clinica Nova",
      ownerEmail: "dono@clinica.com",
      ownerName: "Dono",
    });
    expect(result.tenant.name).toBe("Clinica Nova");
    expect(result.tenant.active).toBe(true);

    const created = await env.users.findById(result.tenant.id, result.ownerUserId);
    expect(created?.status).toBe("pending");
    expect(result.ownerActivationToken.length).toBeGreaterThanOrEqual(32);
    const assignments = await env.roles.listForTenant(result.tenant.id);
    expect(assignments.map((a) => a.role)).toContain("owner");
    expect(env.auditRepo.entries.some((e) => e.action === "tenant.provisioned")).toBe(
      true,
    );
  });

  it("nega provisionamento global para owner de clinica", async () => {
    await expect(
      env.service.provisionTenant(owner, {
        name: "X",
        ownerEmail: "x@x.com",
        ownerName: "X",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nega listagem global para owner de clinica", async () => {
    await expect(env.service.listTenants(owner)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(env.service.listTenants(platformAdmin)).resolves.toEqual({
      tenants: [],
      page: 1,
      pageSize: 50,
      hasMore: false,
    });
  });
});

describe("NetworkService unidades", () => {
  let env: ReturnType<typeof build>;
  beforeEach(() => {
    env = build();
  });

  it("cria e lista unidades do tenant do ator", async () => {
    await env.service.createUnit(owner, "Unidade Centro");
    await env.service.createUnit(owner, "Unidade Sul");
    const result = await env.service.listUnits(owner);
    expect(result.units.map((unit) => unit.name)).toEqual([
      "Unidade Centro",
      "Unidade Sul",
    ]);
  });

  it("desativa unidade e audita", async () => {
    const unit = await env.service.createUnit(owner, "Unidade Centro");
    await env.service.setUnitActive(owner, unit.id, false);
    const result = await env.service.listUnits(owner);
    expect(result.units[0]?.active).toBe(false);
    expect(env.auditRepo.entries.some((e) => e.action === "unit.deactivated")).toBe(true);
  });

  it("lanca NotFound ao desativar unidade inexistente", async () => {
    await expect(
      env.service.setUnitActive(owner, "00000000-0000-0000-0000-000000000000", false),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("nega criacao de unidade sem unit:manage", async () => {
    await expect(env.service.createUnit(frontDesk, "X")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("pagina unidades com limite no servidor e indicador hasMore", async () => {
    await env.service.createUnit(owner, "A");
    await env.service.createUnit(owner, "B");
    await env.service.createUnit(owner, "C");

    await expect(
      env.service.listUnits(owner, { page: 1, pageSize: 2 }),
    ).resolves.toMatchObject({
      units: [{ name: "A" }, { name: "B" }],
      page: 1,
      pageSize: 2,
      hasMore: true,
    });
    await expect(
      env.service.listUnits(owner, { page: 2, pageSize: 2 }),
    ).resolves.toMatchObject({
      units: [{ name: "C" }],
      page: 2,
      pageSize: 2,
      hasMore: false,
    });
  });
});

describe("NetworkService.listUsers", () => {
  let env: ReturnType<typeof build>;
  beforeEach(() => {
    env = build();
  });

  it("lista usuarios do tenant com seus papeis, sem hash de senha", async () => {
    const user = await env.users.create({
      tenantId: TENANT,
      email: "dentista@clinica.com",
      displayName: "Dra. Marina",
      passwordHash: "hash:secreto",
      status: "active",
    });
    await env.roles.assign(TENANT, user.id, "dentist", null);

    const result = await env.service.listUsers(owner);
    expect(result.users).toHaveLength(1);
    expect(result.users[0]?.email).toBe("dentista@clinica.com");
    expect(result.users[0]?.roles).toContain("dentist");
    // Nao expoe passwordHash.
    expect(JSON.stringify(result)).not.toContain("hash:");
  });

  it("nega listagem sem user:read", async () => {
    await expect(
      env.service.listUsers({ ...frontDesk, roles: ["patient"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
