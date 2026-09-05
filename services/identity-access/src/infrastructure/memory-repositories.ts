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
  RoleAssignment,
  Session,
  User,
  UserStatus,
} from "../domain/models.js";
import type {
  AuditRepository,
  CreateUserInput,
  RoleRepository,
  SessionRepository,
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
}

export class InMemoryRoleRepository implements RoleRepository {
  private readonly rows: RoleAssignment[] = [];

  async listForUser(tenantId: TenantId, userId: UserId): Promise<RoleAssignment[]> {
    return this.rows.filter((r) => r.tenantId === tenantId && r.userId === userId);
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

export class InMemoryAuditRepository implements AuditRepository {
  public readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
