/**
 * NetworkService: gestao de rede (tenants, unidades e visao de usuarios).
 *
 * Usado pelo admin-portal. Provisiona tenants (operacao administrativa de
 * plataforma), administra unidades clinicas e lista usuarios com seus papeis.
 * Toda mudanca e auditada e sujeita ao RBAC (acoes tenant:*, unit:*, user:read).
 *
 * Isolamento: operacoes de unidade/usuario sao sempre escopadas ao tenant do
 * ator. Provisionar tenant e listar todos os tenants sao operacoes de
 * plataforma, restritas a uma identidade com papel platform-admin.
 */

import type { ClinicUnitId, Role, TenantContext } from "@dentalprime/core";

import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { ClinicUnit, Tenant, User } from "../domain/models.js";
import type {
  RoleRepository,
  InvitationRepository,
  IdentityUnitOfWork,
  TenantRepository,
  UnitRepository,
  UserRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { AuthorizationService } from "./authorization-service.js";
import type { InvitationTokenService } from "./invitation-token.js";

/** Usuario com seus papeis, para exibicao no admin-portal. */
export interface UserWithRoles {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: string;
  readonly roles: readonly Role[];
}

export interface PaginationInput {
  readonly page: number;
  readonly pageSize: number;
}

export interface PageMetadata {
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export interface TenantPage extends PageMetadata {
  readonly tenants: readonly Tenant[];
}

export interface UnitPage extends PageMetadata {
  readonly units: readonly ClinicUnit[];
}

export interface UserPage extends PageMetadata {
  readonly users: readonly UserWithRoles[];
}

const DEFAULT_PAGE: PaginationInput = { page: 1, pageSize: 50 };

function repositoryWindow(input: PaginationInput): {
  readonly page: number;
  readonly pageSize: number;
  readonly limit: number;
  readonly offset: number;
} {
  const { page, pageSize } = input;
  const offset = (page - 1) * pageSize;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger(offset)
  ) {
    throw new ValidationError("Paginacao invalida.");
  }
  return { page, pageSize, limit: pageSize + 1, offset };
}

export interface ProvisionTenantInput {
  readonly name: string;
  readonly ownerEmail: string;
  readonly ownerName: string;
}

export interface ProvisionTenantResult {
  readonly tenant: Tenant;
  readonly ownerUserId: string;
  readonly ownerActivationToken: string;
  readonly ownerActivationExpiresAt: Date;
}

export interface NetworkServiceDeps {
  readonly tenants: TenantRepository;
  readonly units: UnitRepository;
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly invitations: InvitationRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
  readonly invitationTokens: InvitationTokenService;
  readonly invitationTtlSeconds: number;
  readonly unitOfWork: IdentityUnitOfWork;
}

export class NetworkService {
  constructor(private readonly deps: NetworkServiceDeps) {}

  /**
   * Provisiona um novo tenant e cria seu owner inicial (pendente de ativacao).
   * Operacao de plataforma: requer platform:manage. Auditada no tenant criado.
   */
  async provisionTenant(
    actor: TenantContext,
    input: ProvisionTenantInput,
  ): Promise<ProvisionTenantResult> {
    this.deps.authorization.ensure(actor, "platform:manage", {
      tenantId: actor.tenantId,
    });
    const ownerActivationToken = this.deps.invitationTokens.generate();
    const ownerActivationExpiresAt = new Date(
      Date.now() + this.deps.invitationTtlSeconds * 1000,
    );
    const tokenHash = this.deps.invitationTokens.hash(ownerActivationToken);

    return this.deps.unitOfWork.run(async (repositories) => {
      const tenant = await repositories.tenants.create({ name: input.name });
      const owner = await repositories.users.create({
        tenantId: tenant.id,
        email: input.ownerEmail.trim().toLowerCase(),
        displayName: input.ownerName,
        passwordHash: null,
        status: "pending",
      });
      await repositories.roles.assign(tenant.id, owner.id, "owner", null);
      await repositories.invitations.create({
        tenantId: tenant.id,
        userId: owner.id,
        tokenHash,
        expiresAt: ownerActivationExpiresAt,
        createdByUserId: actor.userId,
      });
      await repositories.audit.append({
        tenantId: tenant.id,
        actorUserId: actor.userId,
        action: "tenant.provisioned",
        resourceType: "tenant",
        resourceId: tenant.id,
        metadata: { ownerProvisioned: true },
        ipAddress: null,
      });

      return {
        tenant,
        ownerUserId: owner.id,
        ownerActivationToken,
        ownerActivationExpiresAt,
      };
    });
  }

  /** Lista todos os tenants. Operacao de plataforma: requer platform:manage. */
  async listTenants(
    actor: TenantContext,
    pagination: PaginationInput = DEFAULT_PAGE,
  ): Promise<TenantPage> {
    this.deps.authorization.ensure(actor, "platform:manage", {
      tenantId: actor.tenantId,
    });
    const window = repositoryWindow(pagination);
    const tenants = await this.deps.tenants.list(window);
    return {
      tenants: tenants.slice(0, window.pageSize),
      page: window.page,
      pageSize: window.pageSize,
      hasMore: tenants.length > window.pageSize,
    };
  }

  /** Cria uma unidade no tenant do ator. Requer unit:manage. Auditada. */
  async createUnit(actor: TenantContext, name: string): Promise<ClinicUnit> {
    this.deps.authorization.ensure(actor, "unit:manage", { tenantId: actor.tenantId });

    const unit = await this.deps.units.create({ tenantId: actor.tenantId, name });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "unit.created",
      resourceType: "clinic_unit",
      resourceId: unit.id,
      metadata: { name },
    });

    return unit;
  }

  /** Lista as unidades do tenant do ator. Requer unit:read. */
  async listUnits(
    actor: TenantContext,
    pagination: PaginationInput = DEFAULT_PAGE,
  ): Promise<UnitPage> {
    this.deps.authorization.ensure(actor, "unit:read", { tenantId: actor.tenantId });
    const window = repositoryWindow(pagination);
    const units = await this.deps.units.listByTenant(actor.tenantId, window);
    return {
      units: units.slice(0, window.pageSize),
      page: window.page,
      pageSize: window.pageSize,
      hasMore: units.length > window.pageSize,
    };
  }

  /** Ativa/desativa uma unidade do tenant do ator. Requer unit:manage. Auditada. */
  async setUnitActive(
    actor: TenantContext,
    unitId: ClinicUnitId,
    active: boolean,
  ): Promise<void> {
    this.deps.authorization.ensure(actor, "unit:manage", { tenantId: actor.tenantId });

    const unit = await this.deps.units.findById(actor.tenantId, unitId);
    if (!unit) {
      throw new NotFoundError("Unidade nao encontrada.");
    }

    await this.deps.units.setActive(actor.tenantId, unitId, active);

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: active ? "unit.activated" : "unit.deactivated",
      resourceType: "clinic_unit",
      resourceId: unitId,
    });
  }

  /**
   * Lista os usuarios do tenant do ator, cada um com seus papeis. Requer
   * user:read. Nao expoe hash de senha nem outros dados sensiveis.
   */
  async listUsers(
    actor: TenantContext,
    pagination: PaginationInput = DEFAULT_PAGE,
  ): Promise<UserPage> {
    this.deps.authorization.ensure(actor, "user:read", { tenantId: actor.tenantId });
    const window = repositoryWindow(pagination);
    const fetchedUsers = await this.deps.users.listByTenant(actor.tenantId, window);
    const users = fetchedUsers.slice(0, window.pageSize);
    const assignments = await this.deps.roles.listForUsers(
      actor.tenantId,
      users.map((user) => user.id),
    );

    const rolesByUser = new Map<string, Set<Role>>();
    for (const a of assignments) {
      const set = rolesByUser.get(a.userId) ?? new Set<Role>();
      set.add(a.role);
      rolesByUser.set(a.userId, set);
    }

    return {
      users: users.map((u: User) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        status: u.status,
        roles: [...(rolesByUser.get(u.id) ?? new Set<Role>())],
      })),
      page: window.page,
      pageSize: window.pageSize,
      hasMore: fetchedUsers.length > window.pageSize,
    };
  }

  /** Retorna os dados do proprio tenant do ator. Requer tenant:read. */
  async currentTenant(actor: TenantContext): Promise<Tenant> {
    this.deps.authorization.ensure(actor, "tenant:read", { tenantId: actor.tenantId });
    const tenant = await this.deps.tenants.findById(actor.tenantId);
    if (!tenant) {
      throw new NotFoundError("Tenant nao encontrado.");
    }
    return tenant;
  }
}
