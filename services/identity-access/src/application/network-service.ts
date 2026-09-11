/**
 * NetworkService: gestao de rede (tenants, unidades e visao de usuarios).
 *
 * Usado pelo admin-portal. Provisiona tenants (operacao administrativa de
 * plataforma), administra unidades clinicas e lista usuarios com seus papeis.
 * Toda mudanca e auditada e sujeita ao RBAC (acoes tenant:*, unit:*, user:read).
 *
 * Isolamento: operacoes de unidade/usuario sao sempre escopadas ao tenant do
 * ator. Provisionar tenant e listar todos os tenants sao operacoes de
 * plataforma, restritas a quem tem tenant:manage.
 */

import type { ClinicUnitId, Role, TenantContext } from "@dentalprime/core";

import { NotFoundError } from "../domain/errors.js";
import type { ClinicUnit, Tenant, User } from "../domain/models.js";
import type {
  RoleRepository,
  TenantRepository,
  UnitRepository,
  UserRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { AuthorizationService } from "./authorization-service.js";

/** Usuario com seus papeis, para exibicao no admin-portal. */
export interface UserWithRoles {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: string;
  readonly roles: readonly Role[];
}

export interface ProvisionTenantInput {
  readonly name: string;
  readonly ownerEmail: string;
  readonly ownerName: string;
}

export interface ProvisionTenantResult {
  readonly tenant: Tenant;
  readonly ownerUserId: string;
}

export interface NetworkServiceDeps {
  readonly tenants: TenantRepository;
  readonly units: UnitRepository;
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class NetworkService {
  constructor(private readonly deps: NetworkServiceDeps) {}

  /**
   * Provisiona um novo tenant e cria seu owner inicial (pendente de ativacao).
   * Operacao de plataforma: requer tenant:manage. Auditada no tenant criado.
   */
  async provisionTenant(
    actor: TenantContext,
    input: ProvisionTenantInput,
  ): Promise<ProvisionTenantResult> {
    this.deps.authorization.ensure(actor, "tenant:manage", {
      tenantId: actor.tenantId,
    });

    const tenant = await this.deps.tenants.create({ name: input.name });

    const owner = await this.deps.users.create({
      tenantId: tenant.id,
      email: input.ownerEmail,
      displayName: input.ownerName,
      passwordHash: null,
      status: "pending",
    });
    await this.deps.roles.assign(tenant.id, owner.id, "owner", null);

    await this.deps.audit.record({
      tenantId: tenant.id,
      actorUserId: actor.userId,
      action: "tenant.provisioned",
      resourceType: "tenant",
      resourceId: tenant.id,
      metadata: { ownerEmail: input.ownerEmail },
    });

    return { tenant, ownerUserId: owner.id };
  }

  /** Lista todos os tenants. Operacao de plataforma: requer tenant:manage. */
  async listTenants(actor: TenantContext): Promise<readonly Tenant[]> {
    this.deps.authorization.ensure(actor, "tenant:manage", {
      tenantId: actor.tenantId,
    });
    return this.deps.tenants.list();
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
  async listUnits(actor: TenantContext): Promise<readonly ClinicUnit[]> {
    this.deps.authorization.ensure(actor, "unit:read", { tenantId: actor.tenantId });
    return this.deps.units.listByTenant(actor.tenantId);
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
  async listUsers(actor: TenantContext): Promise<readonly UserWithRoles[]> {
    this.deps.authorization.ensure(actor, "user:read", { tenantId: actor.tenantId });

    const [users, assignments] = await Promise.all([
      this.deps.users.listByTenant(actor.tenantId),
      this.deps.roles.listForTenant(actor.tenantId),
    ]);

    const rolesByUser = new Map<string, Set<Role>>();
    for (const a of assignments) {
      const set = rolesByUser.get(a.userId) ?? new Set<Role>();
      set.add(a.role);
      rolesByUser.set(a.userId, set);
    }

    return users.map((u: User) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      status: u.status,
      roles: [...(rolesByUser.get(u.id) ?? new Set<Role>())],
    }));
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
