import { describe, expect, it } from "vitest";

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
import { DevelopmentBootstrapService } from "./development-bootstrap.js";
import type { PasswordHasher } from "./password.js";

const passwords: PasswordHasher = {
  hash: async (plain) => `hash:${plain}`,
  verify: async () => false,
};

describe("DevelopmentBootstrapService", () => {
  it("creates and audits the first owner, then becomes idempotent", async () => {
    const tenants = new InMemoryTenantRepository();
    const users = new InMemoryUserRepository();
    const roles = new InMemoryRoleRepository();
    const audit = new InMemoryAuditRepository();
    const unitOfWork = new InMemoryIdentityUnitOfWork({
      tenants,
      users,
      roles,
      audit,
      units: new InMemoryUnitRepository(),
      sessions: new InMemorySessionRepository(),
      invitations: new InMemoryInvitationRepository(),
    });
    const service = new DevelopmentBootstrapService({
      unitOfWork,
      passwords,
    });
    const input = {
      tenantName: "Clinica de Desenvolvimento",
      adminEmail: "admin@example.invalid",
      adminName: "Administrador",
      adminPassword: "development-password",
    };

    const results = await Promise.all([service.run(input), service.run(input)]);
    const first = results.find((result) => result.status === "created");
    const second = results.find((result) => result.status === "already-initialized");

    if (!first || first.status !== "created") {
      throw new Error("bootstrap nao criou o tenant");
    }
    expect(second).toEqual({ status: "already-initialized", tenantId: first.tenantId });
    expect(await tenants.list({ limit: 2, offset: 0 })).toHaveLength(1);
    expect(
      (await roles.listForUser(first.tenantId, first.adminUserId)).map((r) => r.role),
    ).toEqual(expect.arrayContaining(["platform-admin", "owner"]));
    expect(audit.entries.map((entry) => entry.action)).toEqual([
      "development.bootstrap_completed",
    ]);
  });
});
