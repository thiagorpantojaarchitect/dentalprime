/**
 * AuthorizationService: ponto unico de decisao RBAC.
 *
 * `can(context, action, scope)` resolve as permissoes efetivas do usuario no
 * tenant (e, quando aplicavel, na unidade) e decide allow/deny. Negacoes de
 * acesso a recurso sensivel sao auditadas pelo chamador.
 *
 * Ver `.kiro/specs/identity-access/requirements.md` (Requisito 3).
 */

import type { ClinicUnitId, TenantContext } from "@dentalprime/core";

import { ForbiddenError } from "../domain/errors.js";
import type { Action } from "../domain/permissions.js";
import { roleGrants } from "../domain/permissions.js";

export interface Scope {
  /** Tenant do recurso alvo. */
  readonly tenantId: string;
  /** Unidade do recurso alvo, se aplicavel. */
  readonly unitId?: ClinicUnitId;
}

export class AuthorizationService {
  /**
   * Decide se o contexto pode executar a acao no escopo. Retorna boolean, sem
   * lancar. Regras:
   * 1. O tenant do contexto deve ser o mesmo do recurso (isolamento).
   * 2. Algum papel do contexto deve conceder a acao.
   * 3. Se a acao e escopada a uma unidade, o contexto deve ter acesso a ela
   *    (a menos que possua papel amplo sem restricao de unidade).
   */
  can(context: TenantContext, action: Action, scope: Scope): boolean {
    if (context.tenantId !== scope.tenantId) {
      return false;
    }
    if (!roleGrants(context.roles, action)) {
      return false;
    }
    if (scope.unitId !== undefined && context.units.length > 0) {
      return context.units.includes(scope.unitId);
    }
    return true;
  }

  /**
   * Igual a `can`, mas lanca ForbiddenError quando negado. Util para proteger
   * casos de uso de forma declarativa.
   */
  ensure(context: TenantContext, action: Action, scope: Scope): void {
    if (!this.can(context, action, scope)) {
      throw new ForbiddenError();
    }
  }
}
