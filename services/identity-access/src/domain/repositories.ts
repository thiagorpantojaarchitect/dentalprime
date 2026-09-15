/**
 * Contratos de repositorio do identity-access.
 *
 * Todo metodo que acessa dados de negocio recebe `tenantId` explicitamente. A
 * implementacao DEVE aplicar o filtro por tenant em toda consulta. Isso torna o
 * isolamento multi-tenant obrigatorio no nivel do contrato, nao opcional.
 *
 * Ver `.kiro/steering/architecture.md` e `.kiro/specs/identity-access/design.md`.
 */

import type { ClinicUnitId, Role, TenantId, UserId } from "@dentalprime/core";

import type {
  AuditEntry,
  ClinicUnit,
  Invitation,
  RoleAssignment,
  Session,
  Tenant,
  User,
  UserStatus,
} from "./models.js";

export interface CreateUserInput {
  readonly tenantId: TenantId;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string | null;
  readonly status: UserStatus;
}

/** Limites ja validados pela camada de aplicacao. */
export interface RepositoryPage {
  readonly limit: number;
  readonly offset: number;
}

export interface UserRepository {
  findById(tenantId: TenantId, userId: UserId): Promise<User | null>;
  findByEmail(tenantId: TenantId, email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  setStatus(tenantId: TenantId, userId: UserId, status: UserStatus): Promise<void>;
  setPasswordHash(
    tenantId: TenantId,
    userId: UserId,
    passwordHash: string,
  ): Promise<void>;
  /** Ativa apenas uma conta que ainda esteja pendente e sem senha. */
  activatePending(
    tenantId: TenantId,
    userId: UserId,
    passwordHash: string,
  ): Promise<boolean>;
  /** Troca a senha somente se o hash atual ainda for o esperado. */
  setPasswordHashIfCurrent(
    tenantId: TenantId,
    userId: UserId,
    expectedPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean>;
  /** Lista os usuarios do tenant (ordem estavel por email e id). */
  listByTenant(tenantId: TenantId, page: RepositoryPage): Promise<User[]>;
}

export interface TenantRepository {
  create(input: { name: string }): Promise<Tenant>;
  findById(tenantId: TenantId): Promise<Tenant | null>;
  /** Lista todos os tenants (operacao administrativa de plataforma). */
  list(page: RepositoryPage): Promise<Tenant[]>;
  setActive(tenantId: TenantId, active: boolean): Promise<void>;
}

export interface UnitRepository {
  create(input: { tenantId: TenantId; name: string }): Promise<ClinicUnit>;
  findById(tenantId: TenantId, unitId: ClinicUnitId): Promise<ClinicUnit | null>;
  listByTenant(tenantId: TenantId, page: RepositoryPage): Promise<ClinicUnit[]>;
  setActive(tenantId: TenantId, unitId: ClinicUnitId, active: boolean): Promise<void>;
}

export interface RoleRepository {
  listForUser(tenantId: TenantId, userId: UserId): Promise<RoleAssignment[]>;
  /** Lista todas as atribuicoes do tenant (para compor a lista de usuarios). */
  listForTenant(tenantId: TenantId): Promise<RoleAssignment[]>;
  /** Lista atribuicoes apenas dos usuarios presentes na pagina solicitada. */
  listForUsers(tenantId: TenantId, userIds: readonly UserId[]): Promise<RoleAssignment[]>;
  assign(
    tenantId: TenantId,
    userId: UserId,
    role: Role,
    unitId: ClinicUnitId | null,
  ): Promise<void>;
  removeAll(tenantId: TenantId, userId: UserId): Promise<void>;
}

export interface SessionRepository {
  create(input: {
    tenantId: TenantId;
    userId: UserId;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }): Promise<Session>;
  findActiveByHash(tenantId: TenantId, refreshTokenHash: string): Promise<Session | null>;
  /** Atomically revokes and returns an unexpired refresh session. */
  consumeActiveByHash(
    tenantId: TenantId,
    refreshTokenHash: string,
    now: Date,
  ): Promise<Session | null>;
  revoke(tenantId: TenantId, sessionId: string): Promise<void>;
  revokeAllForUser(tenantId: TenantId, userId: UserId): Promise<void>;
}

export interface InvitationRepository {
  create(input: {
    tenantId: TenantId;
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: UserId;
  }): Promise<Invitation>;
  /** Atomically marks an unexpired invitation as used and returns it. */
  consumeActive(
    tenantId: TenantId,
    tokenHash: string,
    now: Date,
  ): Promise<Invitation | null>;
}

export interface AuditRepository {
  /** Insere uma entrada. Append-only: sem update/delete. */
  append(entry: AuditEntry): Promise<void>;
}

/** Repositorios vinculados a uma mesma transacao de identidade. */
export interface IdentityTransactionRepositories {
  readonly users: UserRepository;
  readonly tenants: TenantRepository;
  readonly units: UnitRepository;
  readonly roles: RoleRepository;
  readonly sessions: SessionRepository;
  readonly invitations: InvitationRepository;
  readonly audit: AuditRepository;
}

export interface IdentityUnitOfWorkOptions {
  /** Serializa apenas workflows que precisam de exclusao global, como bootstrap. */
  readonly advisoryLockId?: number;
}

/**
 * Executa um workflow multi-repositorio de forma atomica. A implementacao
 * PostgreSQL usa uma transacao real; testes usam a implementacao em memoria.
 */
export interface IdentityUnitOfWork {
  run<T>(
    operation: (repositories: IdentityTransactionRepositories) => Promise<T>,
    options?: IdentityUnitOfWorkOptions,
  ): Promise<T>;
}
