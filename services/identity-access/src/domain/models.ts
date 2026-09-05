/**
 * Modelos de dominio do identity-access (formas usadas pela aplicacao).
 * Independentes do schema de persistencia.
 */

import type { ClinicUnitId, Role, TenantId, UserId } from "@dentalprime/core";

export type UserStatus = "pending" | "active" | "disabled";

export interface User {
  readonly id: UserId;
  readonly tenantId: TenantId;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly mfaEnabled: boolean;
  readonly passwordHash: string | null;
}

export interface RoleAssignment {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly role: Role;
  /** Null = vale para todas as unidades do tenant. */
  readonly unitId: ClinicUnitId | null;
}

export interface Session {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly refreshTokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface AuditEntry {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly ipAddress: string | null;
}
