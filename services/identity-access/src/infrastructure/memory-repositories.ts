/**
 * Implementacoes em memoria dos repositorios, para testes.
 *
 * Respeitam o mesmo contrato de isolamento por tenant: toda leitura filtra por
 * `tenantId`, exatamente como a implementacao Drizzle. Servem para testar a
 * logica de aplicacao sem depender de um Postgres em execucao.
 */

import type { ClinicUnitId, Role, TenantId, UserId } from "@dentalprime/core";
import { randomUUID } from "node:crypto";

import type {
  AuditEntry,
  ClinicUnit,
  Invitation,
  RoleAssignment,
  Session,
  Tenant,
  User,
  UserStatus,
} from "../domain/models.js";
import type {
  AuditRepository,
  CreateUserInput,
  InvitationRepository,
  IdentityTransactionRepositories,
  IdentityUnitOfWork,
  IdentityUnitOfWorkOptions,
  RepositoryPage,
  RoleRepository,
  SessionRepository,
  TenantRepository,
  UnitRepository,
  UserRepository,
} from "../domain/repositories.js";

export class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, User>();

  async findById(tenantId: TenantId, userId: UserId): Promise<User | null> {
    const user = this.rows.get(userId);
    return user && user.tenantId === tenantId ? user : null;
  }

  async findByEmail(tenantId: TenantId, email: string): Promise<User | null> {
    for (const user of this.rows.values()) {
      if (user.tenantId === tenantId && user.email === email) return user;
    }
    return null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.findByEmail(input.tenantId, input.email);
    if (existing) {
      throw new Error("email ja cadastrado no tenant");
    }
    const user: User = {
      id: randomUUID(),
      tenantId: input.tenantId,
      email: input.email,
      displayName: input.displayName,
      status: input.status,
      mfaEnabled: false,
      passwordHash: input.passwordHash,
    };
    this.rows.set(user.id, user);
    return user;
  }

  async setStatus(tenantId: TenantId, userId: UserId, status: UserStatus): Promise<void> {
    const user = await this.findById(tenantId, userId);
    if (user) this.rows.set(userId, { ...user, status });
  }

  async setPasswordHash(
    tenantId: TenantId,
    userId: UserId,
    passwordHash: string,
  ): Promise<void> {
    const user = await this.findById(tenantId, userId);
    if (user) this.rows.set(userId, { ...user, passwordHash });
  }

  async activatePending(
    tenantId: TenantId,
    userId: UserId,
    passwordHash: string,
  ): Promise<boolean> {
    const user = await this.findById(tenantId, userId);
    if (!user || user.status !== "pending" || user.passwordHash !== null) return false;
    this.rows.set(userId, { ...user, status: "active", passwordHash });
    return true;
  }

  async setPasswordHashIfCurrent(
    tenantId: TenantId,
    userId: UserId,
    expectedPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean> {
    const user = await this.findById(tenantId, userId);
    if (!user || user.status !== "active" || user.passwordHash !== expectedPasswordHash) {
      return false;
    }
    this.rows.set(userId, { ...user, passwordHash: newPasswordHash });
    return true;
  }

  async listByTenant(tenantId: TenantId, page: RepositoryPage): Promise<User[]> {
    return [...this.rows.values()]
      .filter((u) => u.tenantId === tenantId)
      .sort((a, b) => a.email.localeCompare(b.email) || a.id.localeCompare(b.id))
      .slice(page.offset, page.offset + page.limit);
  }
}

export class InMemoryTenantRepository implements TenantRepository {
  private readonly rows = new Map<string, Tenant>();

  async create(input: { name: string }): Promise<Tenant> {
    const tenant: Tenant = { id: randomUUID(), name: input.name, active: true };
    this.rows.set(tenant.id, tenant);
    return tenant;
  }

  async findById(tenantId: TenantId): Promise<Tenant | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async list(page: RepositoryPage): Promise<Tenant[]> {
    return [...this.rows.values()]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .slice(page.offset, page.offset + page.limit);
  }

  async setActive(tenantId: TenantId, active: boolean): Promise<void> {
    const tenant = this.rows.get(tenantId);
    if (tenant) this.rows.set(tenantId, { ...tenant, active });
  }
}

export class InMemoryUnitRepository implements UnitRepository {
  private readonly rows = new Map<string, ClinicUnit>();

  async create(input: { tenantId: TenantId; name: string }): Promise<ClinicUnit> {
    const unit: ClinicUnit = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      active: true,
    };
    this.rows.set(unit.id, unit);
    return unit;
  }

  async findById(tenantId: TenantId, unitId: ClinicUnitId): Promise<ClinicUnit | null> {
    const unit = this.rows.get(unitId);
    return unit && unit.tenantId === tenantId ? unit : null;
  }

  async listByTenant(tenantId: TenantId, page: RepositoryPage): Promise<ClinicUnit[]> {
    return [...this.rows.values()]
      .filter((u) => u.tenantId === tenantId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .slice(page.offset, page.offset + page.limit);
  }

  async setActive(
    tenantId: TenantId,
    unitId: ClinicUnitId,
    active: boolean,
  ): Promise<void> {
    const unit = await this.findById(tenantId, unitId);
    if (unit) this.rows.set(unitId, { ...unit, active });
  }
}

export class InMemoryRoleRepository implements RoleRepository {
  private readonly rows: RoleAssignment[] = [];

  async listForUser(tenantId: TenantId, userId: UserId): Promise<RoleAssignment[]> {
    return this.rows.filter((r) => r.tenantId === tenantId && r.userId === userId);
  }

  async listForTenant(tenantId: TenantId): Promise<RoleAssignment[]> {
    return this.rows.filter((r) => r.tenantId === tenantId);
  }

  async listForUsers(
    tenantId: TenantId,
    userIds: readonly UserId[],
  ): Promise<RoleAssignment[]> {
    const selected = new Set(userIds);
    return this.rows.filter(
      (role) => role.tenantId === tenantId && selected.has(role.userId),
    );
  }

  async assign(
    tenantId: TenantId,
    userId: UserId,
    role: Role,
    unitId: ClinicUnitId | null,
  ): Promise<void> {
    this.rows.push({ id: randomUUID(), tenantId, userId, role, unitId });
  }

  async removeAll(tenantId: TenantId, userId: UserId): Promise<void> {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i]!;
      if (r.tenantId === tenantId && r.userId === userId) this.rows.splice(i, 1);
    }
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly rows = new Map<string, Session>();

  async create(input: {
    tenantId: TenantId;
    userId: UserId;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }): Promise<Session> {
    const session: Session = {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.rows.set(session.id, session);
    return session;
  }

  async findActiveByHash(
    tenantId: TenantId,
    refreshTokenHash: string,
  ): Promise<Session | null> {
    const now = Date.now();
    for (const session of this.rows.values()) {
      if (
        session.tenantId === tenantId &&
        session.refreshTokenHash === refreshTokenHash &&
        session.revokedAt === null &&
        session.expiresAt.getTime() > now
      ) {
        return session;
      }
    }
    return null;
  }

  async consumeActiveByHash(
    tenantId: TenantId,
    refreshTokenHash: string,
    now: Date,
  ): Promise<Session | null> {
    for (const [id, session] of this.rows.entries()) {
      if (
        session.tenantId === tenantId &&
        session.refreshTokenHash === refreshTokenHash &&
        session.revokedAt === null &&
        session.expiresAt.getTime() > now.getTime()
      ) {
        const consumed = { ...session, revokedAt: now };
        this.rows.set(id, consumed);
        return consumed;
      }
    }
    return null;
  }

  async revoke(tenantId: TenantId, sessionId: string): Promise<void> {
    const session = this.rows.get(sessionId);
    if (session && session.tenantId === tenantId) {
      this.rows.set(sessionId, { ...session, revokedAt: new Date() });
    }
  }

  async revokeAllForUser(tenantId: TenantId, userId: UserId): Promise<void> {
    for (const [id, session] of this.rows.entries()) {
      if (
        session.tenantId === tenantId &&
        session.userId === userId &&
        !session.revokedAt
      ) {
        this.rows.set(id, { ...session, revokedAt: new Date() });
      }
    }
  }
}

export class InMemoryInvitationRepository implements InvitationRepository {
  public readonly rows = new Map<string, Invitation>();

  async create(input: {
    tenantId: TenantId;
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: UserId;
  }): Promise<Invitation> {
    const invitation: Invitation = {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdByUserId: input.createdByUserId,
    };
    this.rows.set(invitation.id, invitation);
    return invitation;
  }

  async consumeActive(
    tenantId: TenantId,
    tokenHash: string,
    now: Date,
  ): Promise<Invitation | null> {
    for (const [id, invitation] of this.rows) {
      if (
        invitation.tenantId === tenantId &&
        invitation.tokenHash === tokenHash &&
        invitation.usedAt === null &&
        invitation.expiresAt.getTime() > now.getTime()
      ) {
        const consumed = { ...invitation, usedAt: now };
        this.rows.set(id, consumed);
        return consumed;
      }
    }
    return null;
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  public readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/** Unit of work used by application tests and local in-memory compositions. */
export class InMemoryIdentityUnitOfWork implements IdentityUnitOfWork {
  private exclusiveTail: Promise<void> = Promise.resolve();

  constructor(private readonly repositories: IdentityTransactionRepositories) {}

  async run<T>(
    operation: (repositories: IdentityTransactionRepositories) => Promise<T>,
    options: IdentityUnitOfWorkOptions = {},
  ): Promise<T> {
    if (options.advisoryLockId === undefined) {
      return operation(this.repositories);
    }

    const previous = this.exclusiveTail;
    let release!: () => void;
    this.exclusiveTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation(this.repositories);
    } finally {
      release();
    }
  }
}
