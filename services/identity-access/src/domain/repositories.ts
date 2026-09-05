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

import type { AuditEntry, RoleAssignment, Session, User, UserStatus } from "./models.js";

export interface CreateUserInput {
  readonly tenantId: TenantId;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string | null;
  readonly status: UserStatus;
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
}

export interface RoleRepository {
  listForUser(tenantId: TenantId, userId: UserId): Promise<RoleAssignment[]>;
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
  revoke(tenantId: TenantId, sessionId: string): Promise<void>;
  revokeAllForUser(tenantId: TenantId, userId: UserId): Promise<void>;
}

export interface AuditRepository {
  /** Insere uma entrada. Append-only: sem update/delete. */
  append(entry: AuditEntry): Promise<void>;
}
