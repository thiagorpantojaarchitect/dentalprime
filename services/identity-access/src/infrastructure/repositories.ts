/**
 * Implementacoes Drizzle dos repositorios, com isolamento por tenant.
 *
 * Cada consulta filtra por `tenantId`. Nao ha metodo que leia dados sem o
 * escopo do tenant. Isso garante o isolamento multi-tenant na pratica.
 */

import type { ClinicUnitId, Role, TenantId, UserId } from "@dentalprime/core";
import { and, asc, eq, isNull, gt, inArray, sql } from "drizzle-orm";

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
import type { Database } from "./db/client.js";
import {
  auditLogs,
  clinicUnits,
  invitations,
  roleAssignments,
  sessions,
  tenants,
  users,
} from "./db/schema.js";

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    displayName: row.displayName,
    status: row.status,
    mfaEnabled: row.mfaEnabled,
    passwordHash: row.passwordHash,
  };
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, userId: UserId): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)))
      .limit(1);
    const row = rows[0];
    return row ? toUser(row) : null;
  }

  async findByEmail(tenantId: TenantId, email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, email)))
      .limit(1);
    const row = rows[0];
    return row ? toUser(row) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const rows = await this.db
      .insert(users)
      .values({
        tenantId: input.tenantId,
        email: input.email,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        status: input.status,
      })
      .returning();
    // O insert com returning sempre devolve a linha criada.
    return toUser(rows[0]!);
  }

  async setStatus(tenantId: TenantId, userId: UserId, status: UserStatus): Promise<void> {
    await this.db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
  }

  async setPasswordHash(
    tenantId: TenantId,
    userId: UserId,
    passwordHash: string,
  ): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
  }

  async activatePending(
    tenantId: TenantId,
    userId: UserId,
    passwordHash: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(users)
      .set({ status: "active", passwordHash, updatedAt: new Date() })
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.id, userId),
          eq(users.status, "pending"),
          isNull(users.passwordHash),
        ),
      )
      .returning({ id: users.id });
    return rows.length === 1;
  }

  async setPasswordHashIfCurrent(
    tenantId: TenantId,
    userId: UserId,
    expectedPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.id, userId),
          eq(users.status, "active"),
          eq(users.passwordHash, expectedPasswordHash),
        ),
      )
      .returning({ id: users.id });
    return rows.length === 1;
  }

  async listByTenant(tenantId: TenantId, page: RepositoryPage): Promise<User[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(asc(users.email), asc(users.id))
      .limit(page.limit)
      .offset(page.offset);
    return rows.map(toUser);
  }
}

function toTenant(row: typeof tenants.$inferSelect): Tenant {
  return { id: row.id, name: row.name, active: row.active };
}

export class DrizzleTenantRepository implements TenantRepository {
  constructor(private readonly db: Database) {}

  async create(input: { name: string }): Promise<Tenant> {
    const rows = await this.db.insert(tenants).values({ name: input.name }).returning();
    return toTenant(rows[0]!);
  }

  async findById(tenantId: TenantId): Promise<Tenant | null> {
    const rows = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const row = rows[0];
    return row ? toTenant(row) : null;
  }

  async list(page: RepositoryPage): Promise<Tenant[]> {
    const rows = await this.db
      .select()
      .from(tenants)
      .orderBy(asc(tenants.name), asc(tenants.id))
      .limit(page.limit)
      .offset(page.offset);
    return rows.map(toTenant);
  }

  async setActive(tenantId: TenantId, active: boolean): Promise<void> {
    await this.db
      .update(tenants)
      .set({ active, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
  }
}

function toUnit(row: typeof clinicUnits.$inferSelect): ClinicUnit {
  return { id: row.id, tenantId: row.tenantId, name: row.name, active: row.active };
}

export class DrizzleUnitRepository implements UnitRepository {
  constructor(private readonly db: Database) {}

  async create(input: { tenantId: TenantId; name: string }): Promise<ClinicUnit> {
    const rows = await this.db
      .insert(clinicUnits)
      .values({ tenantId: input.tenantId, name: input.name })
      .returning();
    return toUnit(rows[0]!);
  }

  async findById(tenantId: TenantId, unitId: ClinicUnitId): Promise<ClinicUnit | null> {
    const rows = await this.db
      .select()
      .from(clinicUnits)
      .where(and(eq(clinicUnits.tenantId, tenantId), eq(clinicUnits.id, unitId)))
      .limit(1);
    const row = rows[0];
    return row ? toUnit(row) : null;
  }

  async listByTenant(tenantId: TenantId, page: RepositoryPage): Promise<ClinicUnit[]> {
    const rows = await this.db
      .select()
      .from(clinicUnits)
      .where(eq(clinicUnits.tenantId, tenantId))
      .orderBy(asc(clinicUnits.name), asc(clinicUnits.id))
      .limit(page.limit)
      .offset(page.offset);
    return rows.map(toUnit);
  }

  async setActive(
    tenantId: TenantId,
    unitId: ClinicUnitId,
    active: boolean,
  ): Promise<void> {
    await this.db
      .update(clinicUnits)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(clinicUnits.tenantId, tenantId), eq(clinicUnits.id, unitId)));
  }
}

export class DrizzleRoleRepository implements RoleRepository {
  constructor(private readonly db: Database) {}

  async listForUser(tenantId: TenantId, userId: UserId): Promise<RoleAssignment[]> {
    const rows = await this.db
      .select()
      .from(roleAssignments)
      .where(
        and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.userId, userId)),
      );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      role: row.role,
      unitId: row.unitId,
    }));
  }

  async listForTenant(tenantId: TenantId): Promise<RoleAssignment[]> {
    const rows = await this.db
      .select()
      .from(roleAssignments)
      .where(eq(roleAssignments.tenantId, tenantId));
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      role: row.role,
      unitId: row.unitId,
    }));
  }

  async listForUsers(
    tenantId: TenantId,
    userIds: readonly UserId[],
  ): Promise<RoleAssignment[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.tenantId, tenantId),
          inArray(roleAssignments.userId, [...userIds]),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      role: row.role,
      unitId: row.unitId,
    }));
  }

  async assign(
    tenantId: TenantId,
    userId: UserId,
    role: Role,
    unitId: ClinicUnitId | null,
  ): Promise<void> {
    await this.db.insert(roleAssignments).values({ tenantId, userId, role, unitId });
  }

  async removeAll(tenantId: TenantId, userId: UserId): Promise<void> {
    await this.db
      .delete(roleAssignments)
      .where(
        and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.userId, userId)),
      );
  }
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    userId: UserId;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }): Promise<Session> {
    const rows = await this.db
      .insert(sessions)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      })
      .returning();
    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      refreshTokenHash: row.refreshTokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }

  async findActiveByHash(
    tenantId: TenantId,
    refreshTokenHash: string,
  ): Promise<Session | null> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tenantId, tenantId),
          eq(sessions.refreshTokenHash, refreshTokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      refreshTokenHash: row.refreshTokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }

  async consumeActiveByHash(
    tenantId: TenantId,
    refreshTokenHash: string,
    now: Date,
  ): Promise<Session | null> {
    const rows = await this.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(sessions.tenantId, tenantId),
          eq(sessions.refreshTokenHash, refreshTokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .returning();
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      refreshTokenHash: row.refreshTokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }

  async revoke(tenantId: TenantId, sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tenantId, tenantId), eq(sessions.id, sessionId)));
  }

  async revokeAllForUser(tenantId: TenantId, userId: UserId): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.tenantId, tenantId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
        ),
      );
  }
}

function toInvitation(row: typeof invitations.$inferSelect): Invitation {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdByUserId: row.createdByUserId,
  };
}

export class DrizzleInvitationRepository implements InvitationRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: TenantId;
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: UserId;
  }): Promise<Invitation> {
    const rows = await this.db.insert(invitations).values(input).returning();
    return toInvitation(rows[0]!);
  }

  async consumeActive(
    tenantId: TenantId,
    tokenHash: string,
    now: Date,
  ): Promise<Invitation | null> {
    const rows = await this.db
      .update(invitations)
      .set({ usedAt: now })
      .where(
        and(
          eq(invitations.tenantId, tenantId),
          eq(invitations.tokenHash, tokenHash),
          isNull(invitations.usedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .returning();
    return rows[0] ? toInvitation(rows[0]) : null;
  }
}

export class DrizzleAuditRepository implements AuditRepository {
  constructor(private readonly db: Database) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLogs).values({
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata,
      ipAddress: entry.ipAddress,
    });
  }
}

/** PostgreSQL unit of work shared by the identity application workflows. */
export class DrizzleIdentityUnitOfWork implements IdentityUnitOfWork {
  constructor(private readonly db: Database) {}

  async run<T>(
    operation: (repositories: IdentityTransactionRepositories) => Promise<T>,
    options: IdentityUnitOfWorkOptions = {},
  ): Promise<T> {
    return this.db.transaction(async (transaction) => {
      if (options.advisoryLockId !== undefined) {
        await transaction.execute(
          sql`SELECT pg_advisory_xact_lock(${options.advisoryLockId})`,
        );
      }

      // Drizzle transactions implement the same query surface used by these
      // repositories. The cast is kept here, at the infrastructure boundary.
      const db = transaction as unknown as Database;
      return operation({
        users: new DrizzleUserRepository(db),
        tenants: new DrizzleTenantRepository(db),
        units: new DrizzleUnitRepository(db),
        roles: new DrizzleRoleRepository(db),
        sessions: new DrizzleSessionRepository(db),
        invitations: new DrizzleInvitationRepository(db),
        audit: new DrizzleAuditRepository(db),
      });
    });
  }
}
