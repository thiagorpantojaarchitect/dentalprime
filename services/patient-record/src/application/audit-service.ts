/**
 * Servico de auditoria (append-only) do patient-record. Registra acesso e
 * alteracao de dados sensiveis: quem, quando, o que e de onde. Nao grava
 * segredos nem PII em claro alem do necessario para identificacao.
 */

import type { TenantId, UserId } from "@dentalprime/core";

import type { AuditRepository } from "../domain/repositories.js";

export interface AuditInput {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly ipAddress?: string | null;
}

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async record(input: AuditInput): Promise<void> {
    await this.repo.append({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
    });
  }
}
