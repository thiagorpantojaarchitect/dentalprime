/**
 * Autorizacao RBAC do smart-scheduling para as acoes de agenda.
 * Espelha o modelo do identity-access; a fonte de papeis e `@dentalprime/core`.
 */

import type { ClinicUnitId, Role, TenantContext } from "@dentalprime/core";

import { ForbiddenError } from "./errors.js";

export type Action = "appointment:read" | "appointment:manage";

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  "platform-admin": [],
  owner: ["appointment:read", "appointment:manage"],
  manager: ["appointment:read", "appointment:manage"],
  dentist: ["appointment:read", "appointment:manage"],
  specialist: ["appointment:read", "appointment:manage"],
  assistant: ["appointment:read", "appointment:manage"],
  "front-desk": ["appointment:read", "appointment:manage"],
  // Leitura do paciente exige casos de uso self-scoped ainda nao expostos aqui.
  patient: [],
};

function roleGrants(roles: readonly Role[], action: Action): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(action));
}

export class AuthorizationService {
  can(context: TenantContext, action: Action, resourceTenantId: string): boolean {
    if (context.tenantId !== resourceTenantId) return false;
    return roleGrants(context.roles, action);
  }

  ensure(context: TenantContext, action: Action, resourceTenantId: string): void {
    if (!this.can(context, action, resourceTenantId)) {
      throw new ForbiddenError();
    }
  }

  /**
   * Aplica tambem o escopo de unidade presente no JWT. Uma lista vazia
   * representa uma atribuicao de papel valida para todas as unidades do tenant.
   */
  ensureUnit(
    context: TenantContext,
    action: Action,
    resourceTenantId: string,
    unitId: ClinicUnitId,
  ): void {
    this.ensure(context, action, resourceTenantId);
    if (context.units.length > 0 && !context.units.includes(unitId)) {
      throw new ForbiddenError();
    }
  }
}
