/**
 * ProcedureCatalogService: catalogo de procedimentos proprios da clinica.
 *
 * Bloqueia o uso de codigos padronizados licenciados (ex.: CDT/ADA) sem acordo
 * formal, por conformidade juridica. Valida custo como decimal nao negativo.
 *
 * Ver `.kiro/specs/treatment-plan/requirements.md` (Requisito 5).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  ConflictError,
  LicensedCodeBlockedError,
  ValidationError,
} from "../domain/errors.js";
import type { Procedure } from "../domain/models.js";
import type { ProcedureRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface CreateProcedureInput {
  readonly name: string;
  readonly description?: string | null;
  readonly baseCost: string;
  /** Se informado, o cadastro e bloqueado (codigo licenciado sem acordo). */
  readonly licensedCode?: string | null;
}

export interface ProcedureCatalogServiceDeps {
  readonly procedures: ProcedureRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

/** Valida um valor monetario decimal (ex.: "1200.00"), nao negativo. */
function isValidMoney(value: string): boolean {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return false;
  return Number.parseFloat(value) >= 0;
}

export class ProcedureCatalogService {
  constructor(private readonly deps: ProcedureCatalogServiceDeps) {}

  /** Cadastra um procedimento proprio. Requer treatment:manage. */
  async create(actor: TenantContext, input: CreateProcedureInput): Promise<Procedure> {
    this.deps.authorization.ensure(actor, "treatment:manage", actor.tenantId);

    if (input.licensedCode) {
      throw new LicensedCodeBlockedError();
    }
    if (!input.name.trim()) {
      throw new ValidationError("Nome do procedimento e obrigatorio.");
    }
    if (!isValidMoney(input.baseCost)) {
      throw new ValidationError("Custo base invalido.");
    }

    const existing = await this.deps.procedures.findByName(
      actor.tenantId,
      input.name.trim(),
    );
    if (existing) {
      throw new ConflictError("Ja existe um procedimento com este nome no tenant.");
    }

    const procedure = await this.deps.procedures.create({
      tenantId: actor.tenantId,
      name: input.name.trim(),
      description: input.description ?? null,
      baseCost: input.baseCost,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "procedure.created",
      resourceType: "procedure_catalog",
      resourceId: procedure.id,
    });

    return procedure;
  }

  /** Lista procedimentos ativos. Requer treatment:read. */
  async listActive(actor: TenantContext): Promise<Procedure[]> {
    this.deps.authorization.ensure(actor, "treatment:read", actor.tenantId);
    return this.deps.procedures.listActive(actor.tenantId);
  }
}
