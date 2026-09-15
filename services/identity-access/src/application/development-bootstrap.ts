import type { TenantId, UserId } from "@dentalprime/core";

import type { IdentityUnitOfWork } from "../domain/repositories.js";
import type { PasswordHasher } from "./password.js";

const DEVELOPMENT_BOOTSTRAP_LOCK_ID = 1_144_095_281;

export interface DevelopmentBootstrapInput {
  readonly tenantName: string;
  readonly adminEmail: string;
  readonly adminName: string;
  readonly adminPassword: string;
}

export type DevelopmentBootstrapResult =
  | { readonly status: "already-initialized"; readonly tenantId: TenantId }
  | {
      readonly status: "created";
      readonly tenantId: TenantId;
      readonly adminUserId: UserId;
    };

export interface DevelopmentBootstrapDeps {
  readonly unitOfWork: IdentityUnitOfWork;
  readonly passwords: PasswordHasher;
}

/**
 * Creates the first development tenant without exposing an unauthenticated HTTP
 * endpoint. It is intentionally fail-closed once any tenant exists.
 */
export class DevelopmentBootstrapService {
  constructor(private readonly deps: DevelopmentBootstrapDeps) {}

  async run(input: DevelopmentBootstrapInput): Promise<DevelopmentBootstrapResult> {
    const passwordHash = await this.deps.passwords.hash(input.adminPassword);
    return this.deps.unitOfWork.run(
      async (repositories) => {
        const existing = (await repositories.tenants.list({ limit: 1, offset: 0 }))[0];
        if (existing) {
          return { status: "already-initialized", tenantId: existing.id };
        }

        const tenant = await repositories.tenants.create({ name: input.tenantName });
        const admin = await repositories.users.create({
          tenantId: tenant.id,
          email: input.adminEmail.trim().toLowerCase(),
          displayName: input.adminName,
          passwordHash,
          status: "active",
        });
        // O bootstrap cria a unica identidade de operador da plataforma. O
        // papel owner continua limitado ao tenant e nao concede acesso global.
        await repositories.roles.assign(tenant.id, admin.id, "platform-admin", null);
        await repositories.roles.assign(tenant.id, admin.id, "owner", null);
        await repositories.audit.append({
          tenantId: tenant.id,
          actorUserId: admin.id,
          action: "development.bootstrap_completed",
          resourceType: "tenant",
          resourceId: tenant.id,
          metadata: { source: "local-command" },
          ipAddress: null,
        });

        return { status: "created", tenantId: tenant.id, adminUserId: admin.id };
      },
      { advisoryLockId: DEVELOPMENT_BOOTSTRAP_LOCK_ID },
    );
  }
}
